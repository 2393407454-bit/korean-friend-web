// 智能体编排：通道感知 → 状态注入 → LLM 结构化输出 → 状态回写
const fs = require('fs');
const path = require('path');
const store = require('./store');
const llm = require('./llm');
const characters = require('./characters');
const { buildSystemPrompt, buildStreamSystemPrompt } = require('./system-prompt');
const security = require('./security');

const SRS_DAYS = [1, 3, 7, 14]; // 间隔复习：1/3/7/14 天
const LEVEL_RATIO = { TOPIK1: 0.3, TOPIK2: 0.3, TOPIK3: 0.6, TOPIK4: 0.6, TOPIK5: 0.9, TOPIK6: 0.9 };
const GOALS = ['kpop', 'kdrama', 'study', 'work', 'travel', 'hobby'];

function addDays(n) {
  return new Date(Date.now() + n * 86400000).toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function applyStatePatch(doc, patch) {
  if (!patch || typeof patch !== 'object') return;
  doc.session = doc.session || {};
  const p = doc.profile;
  const pr = doc.progress;

  if (patch.level && /^TOPIK[1-6]$/.test(patch.level)) {
    p.level = patch.level;
    // 等级确定时，自动按教学规范落地双语配比与罗马音开关（模型未显式给出时）
    if (patch.korean_ratio == null) p.korean_ratio = LEVEL_RATIO[patch.level];
    if (patch.romanization == null) p.romanization = LEVEL_RATIO[patch.level] <= 0.3;
  }
  if (patch.goal && GOALS.includes(patch.goal)) p.goal = patch.goal;
  if (typeof patch.korean_ratio === 'number') p.korean_ratio = patch.korean_ratio;
  if (typeof patch.romanization === 'boolean') p.romanization = patch.romanization;
  if (Array.isArray(patch.interests)) {
    p.interests = [...new Set([...(p.interests || []), ...patch.interests.map(String)])].slice(0, 10);
  }

  for (const v of patch.vocab_add || []) {
    if (!v || !v.ko) continue;
    const found = pr.vocab.find((x) => x.ko === v.ko);
    if (found) found.seen = (found.seen || 1) + 1;
    else pr.vocab.push({ ko: String(v.ko), zh: v.zh || '', seen: 1, srs_stage: 1, due_at: addDays(SRS_DAYS[0]) });
  }
  if (pr.vocab.length > 500) pr.vocab = pr.vocab.slice(-500);

  for (const r of patch.vocab_reviewed || []) {
    const found = pr.vocab.find((x) => x.ko === r.ko);
    if (!found) continue;
    if (r.correct) {
      found.srs_stage = Math.min((found.srs_stage || 1) + 1, SRS_DAYS.length);
      found.due_at = addDays(SRS_DAYS[found.srs_stage - 1]);
    } else {
      found.srs_stage = 1;
      found.due_at = addDays(SRS_DAYS[0]);
    }
  }

  for (const g of patch.grammar_learned || []) {
    if (!g) continue;
    pr.grammar_learning = (pr.grammar_learning || []).filter((x) => x !== g);
    if (!pr.grammar_mastered.includes(g)) pr.grammar_mastered.push(g);
  }

  // 同类错误累计次数，触发「第 3 次开专项课」的教学规则
  for (const e of patch.errors || []) {
    if (!e || !e.wrong) continue;
    const found = pr.error_log.find((x) => x.wrong === e.wrong);
    if (found) {
      found.count = (found.count || 1) + 1;
      found.last = today();
      if (e.right) found.right = e.right;
    } else {
      pr.error_log.push({
        code: e.code || 'G',
        wrong: String(e.wrong),
        right: e.right || '',
        note: e.note || '',
        count: 1,
        last: today()
      });
    }
  }
  if (pr.error_log.length > 200) pr.error_log = pr.error_log.slice(-200);

  for (const w of patch.weak_points || []) {
    if (w && !pr.weak_points.includes(w)) pr.weak_points.push(String(w));
  }

  if (patch.mode) doc.session.mode = patch.mode;
  if (patch.scenario) doc.session.scenario = patch.scenario;
}

// 内层 JSON 常因未转义引号无法 JSON.parse，用锚点正则容错抢救
function unescapeJsonString(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function salvageNestedProtocol(t) {
  const speech = (t.match(/"speech"\s*:\s*"([\s\S]*?)"\s*,\s*"display"/) || [])[1];
  const display = (t.match(/"display"\s*:\s*"([\s\S]*?)"\s*,\s*"state_patch"/) || [])[1];
  if (speech == null && display == null) return null;
  let patch = {};
  const spIdx = t.indexOf('"state_patch"');
  if (spIdx !== -1) {
    const parsed = llm.extractJSON(t.slice(spIdx));
    if (parsed) patch = parsed.state_patch || parsed;
  }
  return {
    speech: speech != null ? unescapeJsonString(speech) : '',
    display: display != null ? unescapeJsonString(display) : speech != null ? unescapeJsonString(speech) : '',
    state_patch: patch && typeof patch === 'object' ? patch : {},
    ui_hints: {}
  };
}

// 防御性规整：模型偶尔会把整个协议 JSON 回显进 display（或把 display 输出成对象），
// 此时外层 state_patch 常为空，必须解包合并，否则状态丢失。
function normalizeOut(out) {
  if (out.display && typeof out.display === 'string') {
    const t = out.display.trim();
    if (t.startsWith('{') && t.includes('"speech"')) {
      const inner = llm.extractJSON(t);
      if (inner && (inner.display || inner.speech)) {
        return {
          speech: inner.speech || out.speech || '',
          display:
            typeof inner.display === 'string'
              ? inner.display
              : inner.display
                ? JSON.stringify(inner.display, null, 2)
                : (inner.speech || ''),
          state_patch: inner.state_patch || out.state_patch || {},
          ui_hints: inner.ui_hints || out.ui_hints || {}
        };
      }
      const salvaged = salvageNestedProtocol(t);
      if (salvaged) return salvaged;
    }
  }
  if (out.display && typeof out.display === 'object') {
    out.display = JSON.stringify(out.display, null, 2);
  }
  return out;
}

async function handleChat({ userId, text, channel, mode, frameBase64, characterId }) {
  const doc = store.loadUser(userId);
  doc.session = doc.session || {};
  doc.session.channel = channel || 'text';
  if (mode) doc.session.mode = mode;
  const character = characters.personaPrompt(characterId);

  let visionNote = null;
  if (channel === 'video' && frameBase64) {
    visionNote = await llm.analyzeFrame(frameBase64);
  }

  // 内容安全（发布上线后由微信 msgSecCheck 承担）
  if (text && !(await security.checkText(text))) {
    return {
      speech: '이 이야기는 함께 공부하기에 조금 곤란해요. 다른 이야기 해요!',
      display: '😅 这条内容不太适合一起学习，我们聊点别的吧！다른 주제로 가요~',
      ui_hints: {}
    };
  }

  const finalText =
    text ||
    (channel === 'video'
      ? '（用户开启了摄像头，请根据口型分析结果指导发音：先给一个具体的口型纠正建议，再带练一遍相关音。）'
      : '');

  const messages = [
    { role: 'system', content: buildSystemPrompt(doc, visionNote, character) },
    ...doc.messages.slice(-8), // 控制上下文长度，保证响应速度
    { role: 'user', content: finalText }
  ];

  const out = normalizeOut(await llm.chatJSON(messages));
  applyStatePatch(doc, out.state_patch || {});

  doc.messages.push({ role: 'user', content: finalText.slice(0, 600) });
  doc.messages.push({ role: 'assistant', content: (out.display || out.speech || '').slice(0, 600) });
  if (doc.messages.length > 24) doc.messages = doc.messages.slice(-24);
  store.saveUser(doc);

  return {
    speech: out.speech || '',
    display: out.display || out.speech || '',
    ui_hints: out.ui_hints || {},
    profile: doc.profile
  };
}

async function handleUpload({ userId, file, mode }) {
  const doc = store.loadUser(userId);
  let material = '';
  const isImage = file && /^image\//.test(file.mimetype || '');

  if (isImage) {
    const b64 = fs.readFileSync(file.path).toString('base64');
    material = await llm.analyzeImage(b64);
  } else if (file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.txt', '.md', '.srt', '.lrc'].includes(ext)) {
      material = fs.readFileSync(file.path, 'utf8').slice(0, 12000);
    } else {
      fs.unlink(file.path, () => {});
      return {
        speech: '그 파일은 아직 못 읽어요. 사진이나 텍스트 파일로 보내 주세요!',
        display: '📄 目前支持：图片（教材/菜单/路牌/歌词）和 txt / md / srt / lrc 文档。\n其他格式请先截图或转存后再发给我～',
        ui_hints: {}
      };
    }
  }
  if (file) fs.unlink(file.path, () => {});

  if (!material.trim()) {
    return {
      speech: '죄송해요, 내용을 읽지 못했어요. 다시 보내 주실 수 있어요?',
      display: '😵 没能识别出材料内容，换个更清晰的角度再拍一张试试？',
      ui_hints: {}
    };
  }

  doc.last_material = material.slice(0, 1500);
  store.saveUser(doc);

  const label = isImage ? '图片材料' : '文本文档';
  return handleChat({
    userId,
    channel: 'text',
    mode: mode || '教材精讲',
    text: '[用户上传了' + label + ']\n材料内容如下：\n' + material
  });
}

// —— 跟读评分：ASR 识别 + AI 发音教练评价 ——
function mockScoreFallback(target, asrText, sim) {
  const s = Math.round(Math.min(98, sim * 90 + 10));
  const syls = target.replace(/\s+/g, '').split('');
  const feedback = syls.slice(0, 8).map((ch, i) => ({ syl: ch, ok: s >= 80 ? i !== 2 : i % 2 === 0 }));
  return {
    score: s,
    advice: s >= 80 ? '很接近了！注意收音和尾音的停顿。' : '放慢速度，把每个音节读清楚再连起来。',
    feedback
  };
}

async function handlePronounce({ target, audioPath }) {
  let asrText = '';
  try {
    asrText = (await llm.transcribe(audioPath) || '').trim();
  } catch (e) {
    console.warn('[pronounce] ASR 失败：', e.message);
  }

  const ta = target.replace(/\s+/g, '');
  const ra = asrText.replace(/\s+/g, '');
  let match = 0;
  for (const ch of ra) if (ta.includes(ch)) match++;
  const sim = ta.length ? Math.min(1, match / Math.max(ta.length, ra.length || 1)) : 0;

  let evalOut = null;
  try {
    const prompt =
      '你是一位耐心的韩语发音教练，学生是中国初学者。\n' +
      '目标句子：「' + target + '」\n' +
      '学生跟读的语音识别结果：「' + (asrText || '（未能识别）') + '」（识别本身可能有误差，仅供参考）\n' +
      '字符相似度：' + Math.round(sim * 100) + '%\n' +
      '请综合评估发音并给出针对性指导。只输出一个 JSON 对象，不要任何其他文字：\n' +
      '{"score": 0到100的整数, "advice": "针对中国学习者的中文发音建议，30字以内，具体到口型/收音/连音等", "feedback": [{"syl": "目标句的音节", "ok": true}]}\n' +
      'feedback 按顺序覆盖目标句每个音节，ok 表示该音节很可能读对了。score：90+近乎完美，70+有小瑕疵，60以下需要重点练习。';
    const raw = await llm.chatText([{ role: 'user', content: prompt }], 0.4);
    const parsed = llm.extractJSON(raw);
    if (parsed && typeof parsed.score === 'number') {
      evalOut = {
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        advice: String(parsed.advice || '').slice(0, 120),
        feedback: Array.isArray(parsed.feedback) ? parsed.feedback.slice(0, 20) : []
      };
    }
  } catch (e) {
    console.warn('[pronounce] AI 评分失败：', e.message);
  }
  if (!evalOut) evalOut = mockScoreFallback(target, asrText, sim);
  return { ...evalOut, asr_text: asrText };
}

// —— 流式对话：逐增量回调，结束时返回 speech / state / 韩语句子 ——
const HANGUL_SENTENCE = /[\uAC00-\uD7A3][\uAC00-\uD7A3\s.,!?~%]{3,}?[.!?~요다까까]/g;

function extractKoreanSentences(text) {
  const found = String(text || '').match(HANGUL_SENTENCE) || [];
  const cleaned = found
    .map((s) => s.trim())
    .filter((s) => s.replace(/\s+/g, '').length >= 4 && !/^[.,!?~\s]+$/.test(s));
  return [...new Set(cleaned)].slice(0, 6);
}

function extractSpeech(display) {
  // 取用于 TTS 的口语纯文本：去代码块/markdown/罗马音括号/emoji，取前 240 字
  const plain = String(display || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/\([^)]*[A-Za-z][^)]*\)/g, ' ')   // 任何含拉丁字母的括号段（罗马音/标注）都去掉
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[💬📝📚🎯📊✨🌟👍😊🔥]/gu, ' ')
    .replace(/^[ \t]*[-*•][ \t]*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 240);
}

async function handleChatStream({ userId, text, channel, mode, characterId, onDelta }) {
  const doc = store.loadUser(userId);
  doc.session = doc.session || {};
  doc.session.channel = channel || 'text';
  if (mode) doc.session.mode = mode;
  const character = characters.personaPrompt(characterId);

  if (text && !(await security.checkText(text))) {
    const msg = '😅 这条内容不太适合一起学习，我们聊点别的吧！다른 주제로 가요~';
    if (onDelta) onDelta(msg);
    return { speech: '', display: msg, state: {}, korean_sentences: [] };
  }

  const messages = [
    { role: 'system', content: buildStreamSystemPrompt(doc, null, character) },
    ...doc.messages.slice(-8),
    { role: 'user', content: text }
  ];

  const full = await llm.chatStream(messages, { maxTokens: 800, onDelta });

  // 剥离末尾状态行
  let display = full;
  let state = {};
  const m = full.match(/@@STATE@@([\s\S]*)$/);
  if (m) {
    display = full.slice(0, m.index).trim();
    try {
      state = llm.extractJSON(m[1]) || {};
    } catch (e) {
      state = {};
    }
  }
  display = display.replace(/@@STATE@@[\s\S]*$/, '').trim();
  // 兜底：模型把正文全部放进状态行之后等异常情况，保证 display 永不为空
  if (!display) display = full.replace(/@@STATE@@[^\n]*\n?/g, '').trim();
  if (!display) display = '（AI 没有返回内容，请重新发送试试）';

  applyStatePatch(doc, state);
  const koreanSentences = extractKoreanSentences(display);

  doc.messages.push({ role: 'user', content: String(text).slice(0, 600) });
  doc.messages.push({ role: 'assistant', content: display.slice(0, 600) });
  if (doc.messages.length > 24) doc.messages = doc.messages.slice(-24);
  store.saveUser(doc);

  return {
    speech: extractSpeech(display),
    display,
    state,
    korean_sentences: koreanSentences,
    profile: doc.profile
  };
}

// —— 新会话：归档当前历史并清空 ——
function archiveSession(userId) {
  const doc = store.loadUser(userId);
  if ((doc.messages || []).length) {
    doc.archived_sessions = doc.archived_sessions || [];
    doc.archived_sessions.push({ at: new Date().toISOString(), messages: doc.messages });
    if (doc.archived_sessions.length > 5) doc.archived_sessions = doc.archived_sessions.slice(-5);
  }
  doc.messages = [];
  store.saveUser(doc);
  return { ok: true };
}

// —— AI 动态发音课程：按学生等级/兴趣/弱点生成个性化跟读句 ——
const BUILTIN_LESSONS = [
  { id: 'B1', level: '入门', emoji: '🅰️', text: '안녕하세요', zh: '你好 / 您好', roman: 'an-nyeong-ha-se-yo', tip: '五个音节慢慢读，「요」上扬像问号。' },
  { id: 'B2', level: '入门', emoji: '👋', text: '안녕히 가세요', zh: '慢走', roman: 'an-nyeong-hi ga-se-yo', tip: '「히」要送气，嘴唇放松。' },
  { id: 'B3', level: '日常', emoji: '🍲', text: '감사합니다', zh: '谢谢（最礼貌）', roman: 'gam-sa-ham-ni-da', tip: '收音「답」读 [m]，末尾 ni-da。' },
  { id: 'B4', level: '日常', emoji: '🍜', text: '주문할게요', zh: '我要点餐了', roman: 'ju-mun-hal-ge-yo', tip: '「할」ㄹ收音轻弹上齿龈。' },
  { id: 'B5', level: '进阶', emoji: '🎤', text: '사랑해요', zh: '我爱你', roman: 'sa-rang-hae-yo', tip: '랑해 之间 ㅎ 连读。' },
  { id: 'B6', level: '进阶', emoji: '✈️', text: '여권 좀 보여 주세요', zh: '请出示护照', roman: 'yeo-gwon jom bo-yeo ju-se-yo', tip: '보여 주세요 连读不停顿。' }
];

// JSON 数组容错提取（extractJSON 只认 {} 对象，课程是 [...]）
function extractJSONArray(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('[');
  if (start === -1) return null;
  for (let end = t.lastIndexOf(']'); end > start; end = t.lastIndexOf(']', end - 1)) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch (e) { /* 继续收缩 */ }
  }
  return null;
}

async function handleLessons({ userId, refresh }) {
  const doc = store.loadUser(userId);
  const cached = doc.pron_lessons;
  const fresh = cached && Date.now() - new Date(cached.at).getTime() < 24 * 3600 * 1000;
  if (!refresh && fresh && cached.lessons && cached.lessons.length) {
    return { lessons: cached.lessons, cached: true };
  }

  const p = doc.profile || {};
  const pr = doc.progress || {};
  const recentErrors = (pr.error_log || []).slice(-5).map((e) => e.wrong + '(→' + e.right + ')');
  const prompt =
    '你是韩语发音课程设计师。为一位中国学习者生成今天的 6 句跟读练习课程。\n' +
    '学生档案：' + JSON.stringify(p) + '\n' +
    '弱点专项：' + JSON.stringify(pr.weak_points || []) + '\n' +
    '近期高频错误：' + JSON.stringify(recentErrors) + '\n' +
    '要求：\n' +
    '1. 难度贴合学生等级；主题优先围绕其兴趣/目标，日常实用\n' +
    '2. 至少 2 句针对弱点和高频错误的专项练习句\n' +
    '3. 每句 8~20 个韩语字母，自然常用；tip 用中文 30 字内，具体到音节/口型/收音\n' +
    '4. level 取值：入门/日常/进阶\n' +
    '只输出 JSON 数组，不要其他文字：\n' +
    '[{"emoji":"🍲","level":"日常","text":"주문할게요","zh":"我要点餐","roman":"ju-mun-hal-ge-yo","tip":"할 的 ㄹ 收音轻弹上齿龈"}]';

  let lessons = null;
  try {
    const raw = await llm.chatText([{ role: 'user', content: prompt }], 0.8);
    const parsed = extractJSONArray(raw);
    if (Array.isArray(parsed) && parsed.length) {
      lessons = parsed
        .slice(0, 8)
        .map((l, i) => ({
          id: 'A' + (i + 1) + '_' + Date.now().toString(36),
          level: l.level || '日常',
          emoji: l.emoji || '🗣️',
          text: String(l.text || '').trim(),
          zh: String(l.zh || '').trim(),
          roman: String(l.roman || '').trim(),
          tip: String(l.tip || '').trim()
        }))
        .filter((l) => l.text);
    }
  } catch (e) {
    console.warn('[lessons] AI 生成失败：', e.message);
  }

  if (!lessons || !lessons.length) {
    return { lessons: BUILTIN_LESSONS, cached: false, fallback: true };
  }
  doc.pron_lessons = { lessons, at: new Date().toISOString() };
  store.saveUser(doc);
  return { lessons, cached: false };
}

// —— AI 生成韩剧风格台词卡：按剧名/主题/难度，罗马音断句 + 双语注解 ——
async function handleDramaQuotes({ userId, drama, theme, level, refresh }) {
  const doc = store.loadUser(userId);
  const cacheKey = [drama || '经典', theme || '全部', level || '全部'].join('_');
  const cached = doc.drama_quotes && doc.drama_quotes.key === cacheKey ? doc.drama_quotes : null;
  const fresh = cached && Date.now() - new Date(cached.at).getTime() < 12 * 3600 * 1000;
  if (!refresh && fresh && cached.items && cached.items.length) {
    return { quotes: cached.items, cached: true };
  }

  const p = doc.profile || {};
  const prompt =
    '你是韩剧台词学习内容编辑。请生成 6 句「韩剧风格」的经典台词卡，供中国学习者跟读与背诵。\n' +
    '风格来源：' + (drama && drama !== '全部' ? '参考《' + drama + '》的语气与氛围' : '经典韩剧的浪漫/治愈氛围') + '\n' +
    '主题：' + (theme && theme !== '全部' ? theme : '爱情或人生') + '；难度：' + (level && level !== '全部' ? level : '日常') + '\n' +
    '学习者等级：' + (p.level || 'TOPIK2') + '，兴趣：' + JSON.stringify(p.interests || []) + '\n' +
    '要求：\n' +
    '1. 每句 6~20 个韩语字母，情感饱满、适合跟读\n' +
    '2. roman 必须按音节断开、音节间用「-」连接（如 an-nyeong-ha-se-yo），禁止整串连写\n' +
    '3. grammar 一句话讲该句的核心语法点（中文，30 字内）\n' +
    '4. vocab 给 2 个核心词\n' +
    '只输出 JSON 数组，不要其他文字：\n' +
    '[{"drama":"' + (drama || '韩剧风格') + '","theme":"' + (theme || '爱情') + '","level":"' + (level || '日常') + '","ko":"...","roman":"...","zh":"...","grammar":"...","vocab":[{"ko":"...","zh":"..."}],"similar":["..."]}]';

  let items = null;
  try {
    const raw = await llm.chatText([{ role: 'user', content: prompt }], 0.85);
    const parsed = extractJSONArray(raw);
    if (Array.isArray(parsed) && parsed.length) {
      items = parsed.slice(0, 8).map((q, i) => ({
        id: 'ai' + (i + 1) + '_' + Date.now().toString(36),
        drama: q.drama || drama || '韩剧风格',
        theme: q.theme || theme || '爱情',
        level: q.level || level || '日常',
        ko: String(q.ko || '').trim(),
        roman: String(q.roman || '').trim(),
        zh: String(q.zh || '').trim(),
        grammar: String(q.grammar || '').trim(),
        vocab: Array.isArray(q.vocab) ? q.vocab.slice(0, 4) : [],
        similar: Array.isArray(q.similar) ? q.similar.slice(0, 3) : []
      })).filter((q) => q.ko && q.roman && q.zh);
    }
  } catch (e) {
    console.warn('[quotes] AI 生成失败：', e.message);
  }

  if (!items || !items.length) {
    return { quotes: [], cached: false, fallback: true, error: 'AI 生成失败，请重试或稍后再试' };
  }
  doc.drama_quotes = { key: cacheKey, items, at: new Date().toISOString() };
  store.saveUser(doc);
  return { quotes: items, cached: false };
}

module.exports = { handleChat, handleUpload, handlePronounce, handleChatStream, handleLessons, handleDramaQuotes, archiveSession, extractKoreanSentences, applyStatePatch, normalizeOut };
