// 智能体编排：通道感知 → 状态注入 → LLM 结构化输出 → 状态回写
const fs = require('fs');
const path = require('path');
const store = require('./store');
const llm = require('./llm');
const characters = require('./characters');
const scenarios = require('./scenarios');
const demo = require('./demo');
const { buildSystemPrompt, buildStreamSystemPrompt } = require('./system-prompt');
const songLibrary = require('./song-library');
const security = require('./security');
const tools = require('./tools');

const SRS_DAYS = [1, 3, 7, 14]; // 间隔复习：1/3/7/14 天
const LEVEL_RATIO = { TOPIK1: 0.3, TOPIK2: 0.3, TOPIK3: 0.6, TOPIK4: 0.6, TOPIK5: 0.9, TOPIK6: 0.9 };
const GOALS = ['kpop', 'kdrama', 'study', 'work', 'travel', 'hobby'];
const SELF_LEVELS = ['absolute_beginner', 'beginner', 'intermediate', 'advanced'];

function normalizedSample(text) {
  return String(text || '').toLowerCase().replace(/[^\uac00-\ud7a3ㄱ-ㅎㅏ-ㅣ]/g, '');
}

function hasMeaningfulKorean(text) {
  const raw = String(text || '');
  const hangul = (raw.match(/[\uac00-\ud7a3ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  const letters = (raw.match(/[\p{L}\p{M}]/gu) || []).length;
  return hangul >= 3 && letters > 0 && hangul / letters >= 0.5;
}

function directBeginnerPhraseReply(text) {
  const raw = String(text || '');
  if (!/怎么办/.test(raw) || !/(韩语|韩文|韩国语)/.test(raw) || !/(怎么说|怎么读|怎么表达|翻译)/.test(raw)) return null;
  return {
    display: '最常用、适合初学者的说法：\n어떡해요?（eo-tteok-hae-yo）\n意思是“怎么办？/我该怎么办？”',
    speech: '“怎么办”可以说“어떡해요”，意思是“怎么办”或“我该怎么办”。'
  };
}

function saveGuardedTurn(doc, userText, reply) {
  doc.messages.push({ role: 'user', content: String(userText || '').slice(0, 600) });
  doc.messages.push({ role: 'assistant', content: String(reply || '').slice(0, 600) });
  if (doc.messages.length > 24) doc.messages = doc.messages.slice(-24);
  touchStats(doc, { turns: 1, errors: 0, newWords: 0 });
  store.saveUser(doc);
}

function hasNewKoreanSample(doc, text) {
  if (!hasMeaningfulKorean(text)) return false;
  const sample = normalizedSample(text);
  return !(doc.messages || []).slice(-24).some((m) => m && m.role === 'user' && normalizedSample(m.content) === sample);
}

function candidateEvidenceTurns(doc, text) {
  const assessment = (doc.profile && doc.profile.assessment) || {};
  return (Number(assessment.evidence_turns) || 0) + (hasNewKoreanSample(doc, text) ? 1 : 0);
}

function recordLearnerEvidence(doc, text) {
  const p = doc.profile;
  if (!hasNewKoreanSample(doc, text)) return false;
  p.assessment = p.assessment || { status: 'not_assessed', source: 'none', confidence: 'low', evidence_turns: 0, assessed_at_evidence: 0, basis: [] };
  p.assessment.evidence_turns = (Number(p.assessment.evidence_turns) || 0) + 1;
  return true;
}

function detectSelfReportedLevel(text) {
  const t = String(text || '').toLowerCase();
  if (/(零基础|完全不会韩语|不会韩语|没学过韩语|刚开始学韩语|刚入门)/.test(t)) return 'absolute_beginner';
  if (/(韩语初学者|韩语初级|我是初学者|我是初级|topik\s*[12]|topik\s*1|topik\s*2)/i.test(t)) return 'beginner';
  if (/(韩语中级|我是中级|topik\s*[34]|topik\s*3|topik\s*4)/i.test(t)) return 'intermediate';
  if (/(韩语高级|我是高级|topik\s*[56]|topik\s*5|topik\s*6)/i.test(t)) return 'advanced';
  return '';
}

function applySelfReportedLevel(profile, text) {
  const level = detectSelfReportedLevel(text);
  if (!SELF_LEVELS.includes(level)) return;
  profile.self_reported_level = level;
  const assessment = profile.assessment || (profile.assessment = {});
  if (assessment.status !== 'assessed') {
    assessment.status = 'provisional';
    assessment.source = 'self_reported';
    assessment.confidence = 'low';
    assessment.updated_at = new Date().toISOString();
    assessment.basis = ['用户自述水平，尚未通过韩语表达验证'];
  }
}

// 情景解析（Phase 8）：scenarioId → 场景元数据写入 session，返回当前进行中的场景
function resolveScenario(doc, scenarioId) {
  if (scenarioId) {
    const s = scenarios.get(scenarioId);
    if (s) {
      doc.session = doc.session || {};
      doc.session.scenario = {
        id: s.id, name: s.name, name_ko: s.name_ko, category: s.category, level: s.level,
        ai_role: s.ai_role, user_task: s.user_task, goal: s.goal
      };
      doc.session.mode = '情景模拟';
    }
  }
  return (doc.session && doc.session.scenario) || null;
}

function addDays(n) {
  return new Date(Date.now() + n * 86400000).toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function applyStatePatch(doc, patch, options = {}) {
  if (!patch || typeof patch !== 'object') return { mastered: [] };
  doc.session = doc.session || {};
  const p = doc.profile;
  const pr = doc.progress;
  const events = { mastered: [] };

  const assessment = p.assessment || (p.assessment = { status: 'not_assessed', source: 'none', confidence: 'low', evidence_turns: 0, assessed_at_evidence: 0, updated_at: null, basis: [] });
  const pendingEvidence = (Number(assessment.evidence_turns) || 0) - (Number(assessment.assessed_at_evidence) || 0);
  const mayAssessLevel = hasMeaningfulKorean(options.learnerText) && pendingEvidence >= 3;
  if (mayAssessLevel && patch.level && /^TOPIK[1-6]$/.test(patch.level)) {
    p.level = patch.level;
    assessment.status = 'assessed';
    assessment.source = 'observed_korean';
    assessment.confidence = assessment.evidence_turns >= 6 ? 'high' : 'medium';
    assessment.assessed_at_evidence = assessment.evidence_turns;
    assessment.updated_at = new Date().toISOString();
    assessment.basis = Array.isArray(patch.assessment_basis)
      ? patch.assessment_basis.map((x) => String(x).slice(0, 80)).slice(0, 3)
      : ['根据 ' + assessment.evidence_turns + ' 条不同的韩语表达综合估级'];
    if (patch.korean_ratio == null) p.korean_ratio = LEVEL_RATIO[patch.level];
  }
  if (patch.goal && GOALS.includes(patch.goal)) p.goal = patch.goal;
  if (typeof patch.korean_ratio === 'number') p.korean_ratio = patch.korean_ratio;
  // 标音是用户偏好，不由模型随等级自动覆盖。
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

  for (const r of (hasMeaningfulKorean(options.learnerText) ? patch.vocab_reviewed || [] : [])) {
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

  for (const g of (hasMeaningfulKorean(options.learnerText) ? patch.grammar_learned || [] : [])) {
    if (!g) continue;
    pr.grammar_learning = (pr.grammar_learning || []).filter((x) => x !== g);
    if (!pr.grammar_mastered.includes(g)) pr.grammar_mastered.push(g);
  }

  // 同类错误累计次数，触发「第 3 次开专项课」的教学规则
  // Phase 5：错误结构化（point 知识点 / severity 严重度 / explain 中文解释）
  for (const e of (hasMeaningfulKorean(options.learnerText) ? patch.errors || [] : [])) {
    if (!e || !e.wrong) continue;
    const found = pr.error_log.find((x) => x.wrong === e.wrong);
    if (found) {
      found.count = (found.count || 1) + 1;
      found.last = today();
      if (e.right) found.right = e.right;
      if (e.point) found.point = String(e.point).slice(0, 40);
      if (e.severity) found.severity = e.severity;
      if (e.explain) found.explain = String(e.explain).slice(0, 120);
    } else {
      pr.error_log.push({
        code: e.code || 'G',
        wrong: String(e.wrong),
        right: e.right || '',
        note: e.note || '',
        point: e.point ? String(e.point).slice(0, 40) : '',
        severity: e.severity || 'medium',
        explain: e.explain ? String(e.explain).slice(0, 120) : '',
        count: 1,
        first: today(),
        last: today()
      });
    }
  }
  if (pr.error_log.length > 200) pr.error_log = pr.error_log.slice(-200);

  // 流畅度/自然度定性评估：进入画像证据池（≥3 轮后参与能力评分）
  if (hasMeaningfulKorean(options.learnerText) && patch.quality && typeof patch.quality === 'object') {
    const q = patch.quality;
    const flu = typeof q.fluency === 'number' ? Math.max(0, Math.min(100, Math.round(q.fluency))) : null;
    const nat = typeof q.naturalness === 'number' ? Math.max(0, Math.min(100, Math.round(q.naturalness))) : null;
    if (flu != null || nat != null) {
      (pr.quality_log || (pr.quality_log = [])).push({
        fluency: flu,
        naturalness: nat,
        at: new Date().toISOString()
      });
      if (pr.quality_log.length > 60) pr.quality_log = pr.quality_log.slice(-60);
    }
  }

  for (const w of (hasMeaningfulKorean(options.learnerText) ? patch.weak_points || [] : [])) {
    if (w && !pr.weak_points.includes(w)) pr.weak_points.push(String(w));
  }

  // —— 掌握闭环（Phase 6）：模型上报「本轮正确使用了此前易错知识点」——
  // 命中 error_log 中同名/同句错误 → 标记 mastered；从 weak_points 移除；进入 mastered_grammar
  if (hasMeaningfulKorean(options.learnerText) && Array.isArray(patch.errors_mastered)) {
    for (const pt of patch.errors_mastered) {
      if (!pt) continue;
      const key = String(pt);
      const hits = (pr.error_log || []).filter((el) => (el.point && el.point === key) || el.wrong === key);
      if (hits.length) {
        for (const el of hits) {
          if (el.status !== 'mastered') {
            el.status = 'mastered';
            el.mastered_at = today();
            events.mastered.push({ point: el.point || key, wrong: el.wrong, right: el.right || '' });
          }
        }
      } else {
        events.mastered.push({ point: key, wrong: '', right: '' });
      }
      pr.weak_points = (pr.weak_points || []).filter((w) => w !== key);
      if (!pr.grammar_mastered.includes(key)) pr.grammar_mastered.push(key);
    }
  }

  if (patch.mode) doc.session.mode = patch.mode;
  if (patch.scenario) doc.session.scenario = patch.scenario;
  return events;
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
    ui_hints: {},
    sources: []
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
          ui_hints: inner.ui_hints || out.ui_hints || {},
          sources: out.sources || []
        };
      }
      const salvaged = salvageNestedProtocol(t);
      if (salvaged) return { ...salvaged, sources: out.sources || [] };
    }
  }
  if (out.display && typeof out.display === 'object') {
    out.display = JSON.stringify(out.display, null, 2);
  }
  return out;
}

// 统计未配中文翻译的韩语句段：count=违规段数，maxLen=最长违规段的韩字字符数
function untranslatedKoreanStats(text) {
  const lines = String(text || '').split(/\r?\n/);
  let count = 0, maxLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const spans = [...line.matchAll(/[\uac00-\ud7a3ㄱ-ㅎㅏ-ㅣ][\uac00-\ud7a3ㄱ-ㅎㅏ-ㅣ\s.,!?~…:;'"“”‘’()[\]—-]*/g)];
    for (const span of spans) {
      const after = line.slice(span.index + span[0].length);
      if (/[\u3400-\u9fff]/.test(after)) continue;
      let next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      if (next < lines.length && /[\u3400-\u9fff]/.test(lines[next])) continue;
      count++;
      const hangulLen = (span[0].match(/[\uac00-\ud7a3ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
      if (hangulLen > maxLen) maxLen = hangulLen;
    }
  }
  return { count, maxLen };
}

function hasUntranslatedKoreanSentence(text) {
  return untranslatedKoreanStats(text).count > 0;
}

// 只有严重违规（整句/整段韩语无翻译）才兜底替换；个别短引句、单词级引用不打断正常回复
function isSevereUntranslated(text) {
  const s = untranslatedKoreanStats(text);
  return s.maxLen >= 12 || s.count >= 3;
}

const TRANSLATION_GUARD_APOLOGY = '抱歉，我这次没能可靠地配好韩语和中文翻译。\n다시 확인할게요.\n我再确认一下，再给你准确的说法。';

// 翻译自愈重试：在 system 后插入纠正提示，要求带翻译重新输出完整回复
function withRepairNote(messages) {
  const note = {
    role: 'system',
    content: '刚才那次回复里有韩语内容没有紧跟简体中文翻译。请重新输出完整回复：每个韩语句子、短语、台词和歌词后面都必须紧跟自然、准确的简体中文翻译；不要道歉、不要解释格式，直接给出内容。'
  };
  return messages.length && messages[0] && messages[0].role === 'system'
    ? [messages[0], note, ...messages.slice(1)]
    : [note, ...messages];
}

function guardBeginnerTranslation(out) {
  if (!out || !isSevereUntranslated(out.display)) return out;
  return { ...out, display: TRANSLATION_GUARD_APOLOGY, speech: TRANSLATION_GUARD_APOLOGY, state_patch: {}, errors: [], mastered: [], korean_sentences: [] };
}

async function handleChat({ userId, text, channel, mode, frameBase64, characterId, scenarioId }) {
  const doc = store.loadUser(userId);
  doc.session = doc.session || {};
  doc.session.channel = channel || 'text';
  if (mode) doc.session.mode = mode;
  const scenario = resolveScenario(doc, scenarioId);
  const character = characters.personaPrompt(characterId);

  let visionNote = null;
  if (channel === 'video' && frameBase64) {
    visionNote = await llm.analyzeFrame(frameBase64);
  }

  // 内容安全（发布上线后由微信 msgSecCheck 承担）
  if (text && !(await security.checkText(text))) {
    return {
      speech: '이 이야기는 함께 공부하기에 조금 곤란해요. 다른 이야기 해요. 这个话题不太适合一起学习，我们换一个话题吧。',
      display: '😅 这条内容不太适合一起学习，我们换个话题聊吧。\n다른 주제로 이야기해요.\n我们换个话题聊吧。',
      ui_hints: {}
    };
  }

  const finalText =
    text ||
    (channel === 'video'
      ? '（用户开启了摄像头，请根据口型分析结果指导发音：先给一个具体的口型纠正建议，再带练一遍相关音。）'
      : '');

  const directPhrase = directBeginnerPhraseReply(finalText);
  if (directPhrase && !scenario) {
    saveGuardedTurn(doc, finalText, directPhrase.display);
    return { ...directPhrase, ui_hints: {}, errors: [], mastered: [], profile: doc.profile };
  }

  // 已核实曲库内的短歌词样例可确定性教学；其他歌曲交给联网链路处理。
  // 只对本地已核实曲库命中的明确学歌请求走确定性回复；其他 K-pop 话题交给联网对话。
  const songReply = songLibrary.songTeachReply(finalText, doc);
  if (songReply) {
    saveGuardedTurn(doc, finalText, songReply.display);
    return { speech: songReply.speech, display: songReply.display, ui_hints: {}, errors: [], mastered: [], profile: doc.profile };
  }

  computeDifficulty(doc); // 自适应难度：写入 profile.difficulty 供提示词执行

  const messages = [
    { role: 'system', content: buildSystemPrompt(doc, visionNote, character, scenario, finalText, songLibrary.buildSongSection(finalText, doc)) },
    ...doc.messages.slice(-8), // 控制上下文长度，保证响应速度
    { role: 'user', content: finalText }
  ];

  // Agent 模式：语言学习/歌词/复习类问题挂 function tools（知识库/曲库/生词本），
  // 模型自主决定查什么；闲聊与时效问题走原链路，控制免费档延迟。
  const toolTrace = [];
  const chatCall = tools.shouldUse(finalText)
    ? llm.chatJSONWithTools(messages, { doc }, { onToolEvent: (e) => toolTrace.push(e) })
    : llm.chatJSON(messages);
  let out = normalizeOut(await chatCall);
  if (isSevereUntranslated(out.display)) {
    out = normalizeOut(await llm.chatJSON(withRepairNote(messages)));
  }
  out = guardBeginnerTranslation(out);
  recordLearnerEvidence(doc, finalText);
  applySelfReportedLevel(doc.profile, finalText);
  const events = applyStatePatch(doc, out.state_patch || {}, { learnerText: finalText });

  // 学习统计采集（纯本地数据，供画像/报告/连胜使用）
  touchStats(doc, {
    turns: 1,
    errors: hasMeaningfulKorean(finalText) ? ((out.state_patch || {}).errors || []).length : 0,
    newWords: ((out.state_patch || {}).vocab_add || []).length
  });

  doc.messages.push({ role: 'user', content: finalText.slice(0, 600) });
  doc.messages.push({ role: 'assistant', content: (out.display || out.speech || '').slice(0, 600), sources: out.sources || [] });
  if (doc.messages.length > 24) doc.messages = doc.messages.slice(-24);
  store.saveUser(doc);

  return {
    speech: out.speech || '',
    display: out.display || out.speech || '',
    sources: out.sources || [],
    tools_used: toolTrace.map((t) => t.label),
    ui_hints: out.ui_hints || {},
    errors: cardErrors(out.state_patch),
    mastered: events.mastered,
    profile: doc.profile
  };
}

/* =========================================================
   自适应难度引擎（Phase 7）
   输入：TOPIK 等级（基础档）+ 近 7 日正确率（真实纠错/轮数）+ 连续卡壳检测
   输出：difficulty 1-5，写入 profile 供提示词执行 §1.5 细则
   依据全程可解释（difficulty_evidence），数据不足时维持基础档不瞎调。
   ========================================================= */
const DIFF_BY_LEVEL = { TOPIK1: 2, TOPIK2: 2, TOPIK3: 3, TOPIK4: 3, TOPIK5: 4, TOPIK6: 4 };

function computeDifficulty(doc) {
  const p = doc.profile || {};
  const st = doc.stats || {};
  const assessedLevel = p.assessment && p.assessment.status === 'assessed' ? p.level : '';
  let d = (assessedLevel && DIFF_BY_LEVEL[assessedLevel]) || (p.self_reported_level === 'absolute_beginner' ? 1 : 2);
  const evidence = [];

  // 近 7 天正确率：正确率 = 1 - 纠错数/对话轮数（仅轮数充足时参与调整）
  let turns = 0, errors = 0;
  const daily = st.daily || {};
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const rec = daily[day];
    if (rec) {
      turns += rec.turns || 0;
      errors += rec.errors || 0;
    }
  }
  if (turns >= 5) {
    const rate = 1 - Math.min(1, errors / turns);
    evidence.push('近 7 日正确率 ' + Math.round(rate * 100) + '%（' + turns + ' 轮 / ' + errors + ' 处纠错）');
    if (rate >= 0.92) d += 1;
    else if (rate < 0.75) d -= 1;
  } else {
    evidence.push('近 7 日活跃不足 5 轮，维持基础档');
  }

  // 连续卡壳：同一知识点在近 2 天至少出现 2 次且累计次数 ≥2 → 降一档。
  const recentErrs = (doc.progress.error_log || []).slice(-8);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const groups = {};
  recentErrs.forEach((e) => {
    const key = e.point || e.wrong || 'unknown';
    (groups[key] || (groups[key] = [])).push(e);
  });
  const stuck = Object.values(groups).some((items) => items.length >= 2 && items.every((e) => e.last >= twoDaysAgo) && items.reduce((sum, e) => sum + (e.count || 1), 0) >= 2);
  if (stuck) {
    d -= 1;
    evidence.push('近期反复卡在同一类错误，降档放慢');
  }

  const finalD = Math.max(1, Math.min(5, d));
  if (p.difficulty !== finalD) {
    p.difficulty = finalD;
    p.difficulty_at = new Date().toISOString();
  }
  p.difficulty_evidence = evidence.slice(0, 3);
  return finalD;
}

// 前端纠错卡数据：取 state_patch.errors 规范化为卡片字段（最多 3 条）
function cardErrors(patch) {
  return ((patch && patch.errors) || []).slice(0, 3).map((e) => ({
    code: e.code || 'G',
    wrong: e.wrong || '',
    right: e.right || '',
    point: e.point || '',
    severity: e.severity || 'medium',
    explain: e.explain || e.note || ''
  }));
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
        speech: '사진이나 텍스트 파일로 보내 주세요. 请发送图片或文本文件。',
        display: '📄 目前支持图片（教材、菜单、路牌、歌词）和 txt / md / srt / lrc 文档。其他格式请先截图或转成文本文件。\n사진이나 텍스트 파일로 보내 주세요.\n请发送图片或文本文件。',
        ui_hints: {}
      };
    }
  }
  if (file) fs.unlink(file.path, () => {});

  if (!material.trim()) {
    return {
      speech: '자료를 읽지 못했어요. 더 선명하게 찍어서 다시 보내 주실 수 있을까요? 我没能读出材料，可以拍清楚一些再发一次吗？',
      display: '😵 没能识别出材料内容，可以换个更清晰的角度再拍一次吗？\n자료를 읽지 못했어요. 더 선명하게 찍어서 다시 보내 주실 수 있을까요?\n我没能读出材料，可以拍清楚一些再发一次吗？',
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

async function handlePronounce({ target, audioPath, userId }) {
  let asrText = '';
  let source = 'ai';
  try {
    asrText = (await llm.transcribe(audioPath) || '').trim();
  } catch (e) {
    console.warn('[pronounce] ASR 失败：', e.message);
  }
  if (!asrText) {
    const err = new Error('语音识别失败，暂时无法给出可信发音评分，请重试');
    err.status = 503;
    throw err;
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
  if (!evalOut) {
    // 兜底：基于 ASR 字符相似度的启发式估算（仍是真实依据，标记为 fallback，前端展示依据不冒充 AI 评测）
    evalOut = mockScoreFallback(target, asrText, sim);
    source = 'fallback';
  }

  // 评分落库：真实跟读证据进入用户画像（发音维度唯一硬数据来源）
  if (userId) {
    try {
      const doc = store.loadUser(userId);
      recordPronEval(doc, target, evalOut.score, evalOut.advice, asrText, source);
      store.saveUser(doc);
    } catch (e) {
      console.warn('[pronounce] 评分落库失败：', e.message);
    }
  }
  return { ...evalOut, asr_text: asrText, source };
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

async function handleChatStream({ userId, text, channel, mode, characterId, scenarioId, onDelta, onTool }) {
  const doc = store.loadUser(userId);
  doc.session = doc.session || {};
  doc.session.channel = channel || 'text';
  if (mode) doc.session.mode = mode;
  const scenario = resolveScenario(doc, scenarioId);
  const character = characters.personaPrompt(characterId);

  if (text && !(await security.checkText(text))) {
    const msg = '😅 这条内容不太适合一起学习，我们换个话题聊吧。\n다른 주제로 이야기해요.\n我们换个话题聊吧。';
    if (onDelta) onDelta(msg);
    return { speech: '', display: msg, state: {}, korean_sentences: [], errors: [], mastered: [] };
  }

  const directPhrase = directBeginnerPhraseReply(text);
  if (directPhrase && !scenario) {
    if (onDelta) onDelta(directPhrase.display);
    saveGuardedTurn(doc, text, directPhrase.display);
    return { ...directPhrase, state: {}, korean_sentences: ['어떡해요?'], errors: [], mastered: [], profile: doc.profile };
  }
  // 本地已核实曲目可走确定性回复；曲库外歌曲、韩剧台词和普通 K-pop 讨论交给联网对话。
  const songReply = songLibrary.songTeachReply(text, doc);
  if (songReply) {
    if (onDelta) onDelta(songReply.display);
    saveGuardedTurn(doc, text, songReply.display);
    return { speech: songReply.speech, display: songReply.display, state: {}, korean_sentences: [], errors: [], mastered: [], profile: doc.profile };
  }

  computeDifficulty(doc); // 自适应难度

  const messages = [
    { role: 'system', content: buildStreamSystemPrompt(doc, null, character, scenario, text, songLibrary.buildSongSection(text, doc)) },
    ...doc.messages.slice(-8),
    { role: 'user', content: text }
  ];

  const sources = [];
  const toolTrace = [];
  const full = await llm.chatStream(messages, {
    maxTokens: 800,
    onDelta,
    onSources: (found) => sources.splice(0, sources.length, ...(found || [])),
    // Agent 模式：命中学习意图才挂 function tools；工具事件实时推给前端做状态提示
    tools: tools.shouldUse(text) ? tools.getFunctionDefs() : null,
    ctx: { doc },
    onToolEvent: (e) => {
      toolTrace.push(e);
      if (onTool) {
        try { onTool({ name: e.name, label: e.label, ok: e.ok }); } catch (err) { /* 回调异常不中断 */ }
      }
    }
  });
  recordLearnerEvidence(doc, text);
  applySelfReportedLevel(doc.profile, text);

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
  if (isSevereUntranslated(display)) {
    // 自愈重试：带纠正提示再生成一次（本次不再推流，重试成功后由 done 帧整体替换前端内容）
    const retry = await llm.chatStream(withRepairNote(messages), { maxTokens: 800 });
    let retryDisplay = '';
    let retryState = {};
    const rm = retry.match(/@@STATE@@([\s\S]*)$/);
    if (rm) {
      retryDisplay = retry.slice(0, rm.index).trim();
      try {
        retryState = llm.extractJSON(rm[1]) || {};
      } catch (e) {
        retryState = {};
      }
    } else {
      retryDisplay = retry.trim();
    }
    if (retryDisplay && !isSevereUntranslated(retryDisplay)) {
      display = retryDisplay;
      state = retryState;
    } else {
      display = TRANSLATION_GUARD_APOLOGY;
      state = {};
    }
  }

  applyStatePatch(doc, state, { learnerText: text });
  const koreanSentences = extractKoreanSentences(display);

  // 学习统计采集
  touchStats(doc, {
    turns: 1,
    errors: hasMeaningfulKorean(text) ? (state && state.errors || []).length : 0,
    newWords: (state && state.vocab_add || []).length
  });

  doc.messages.push({ role: 'user', content: String(text).slice(0, 600) });
  doc.messages.push({ role: 'assistant', content: display.slice(0, 600), sources });
  if (doc.messages.length > 24) doc.messages = doc.messages.slice(-24);
  store.saveUser(doc);

  return {
    speech: extractSpeech(display),
    display,
    sources,
    tools_used: toolTrace.map((t) => t.label),
    state,
    errors: cardErrors(state),
    mastered: masteredEvents(doc, state),
    korean_sentences: koreanSentences,
    profile: doc.profile
  };
}

// 流式路径的掌握事件：applyStatePatch 已落库，这里读取并输出祝贺所需的精简信息。
// （mastered 的判定在 applyStatePatch 中完成；为避免重复遍历，此处直接重算一次，数据量极小）
function masteredEvents(doc, state) {
  const pts = (state && state.errors_mastered) || [];
  const out = [];
  for (const pt of pts) {
    if (!pt) continue;
    const key = String(pt);
    const hit = (doc.progress.error_log || []).find((el) => (el.point && el.point === key) || el.wrong === key);
    if (hit) out.push({ point: hit.point || key, wrong: hit.wrong, right: hit.right || '' });
    else out.push({ point: key, wrong: '', right: '' });
  }
  return out;
}

// —— 新会话：归档当前历史并清空（连同进行中的情景） ——
function archiveSession(userId) {
  const doc = store.loadUser(userId);
  if ((doc.messages || []).length) {
    doc.archived_sessions = doc.archived_sessions || [];
    doc.archived_sessions.push({ at: new Date().toISOString(), messages: doc.messages });
    if (doc.archived_sessions.length > 5) doc.archived_sessions = doc.archived_sessions.slice(-5);
  }
  doc.messages = [];
  doc.session = doc.session || {};
  doc.session.mode = '';
  doc.session.scenario = null;
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
  // 定向训练（Phase 6）：只取未掌握的错误，带知识点名，供模型生成专项练习句
  const activeErrors = (pr.error_log || [])
    .filter((e) => e.status !== 'mastered')
    .slice(-5)
    .map((e) => e.wrong + ' → ' + e.right + (e.point ? '（知识点：' + e.point + '）' : ''));
  const prompt =
    '你是韩语发音课程设计师。为一位中国学习者生成今天的 6 句跟读练习课程。\n' +
    '学生档案：' + JSON.stringify(p) + '\n' +
    '弱点专项：' + JSON.stringify(pr.weak_points || []) + '\n' +
    '近期高频错误（未掌握）：' + JSON.stringify(activeErrors) + '\n' +
    '要求：\n' +
    '1. 难度贴合学生等级；主题优先围绕其兴趣/目标，日常实用\n' +
    '2. 至少 2 句针对弱点和高频错误的专项练习句——专项句必须让错误知识点在句中出现，帮学生用对一次（定向训练）\n' +
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

// —— 情景复盘（Phase 8）：基于会话历史由 LLM 生成结构化评分卡 ——
async function handleScenarioEnd({ userId }) {
  const doc = store.loadUser(userId);
  const scene = doc.session && doc.session.scenario;
  if (!scene) return { ok: false, error: '当前没有进行中的情景对练' };

  const history = (doc.messages || [])
    .slice(-16)
    .map((m) => (m.role === 'user' ? '学生：' : '老师：') + String(m.content).slice(0, 260))
    .join('\n');

  const prompt =
    '你是韩语情景对练的复盘评审员。请根据以下情景与对话记录，给出客观的结构化复盘。\n' +
    '场景：' + scene.name + '（' + scene.category + '），AI 角色：' + scene.ai_role + '，用户任务：' + scene.user_task + '，目标：' + scene.goal + '\n\n' +
    '对话记录（最近几轮）：\n' + (history || '（无记录）') + '\n\n' +
    '评分标准：任务完成度 40% + 语言准确度 30% + 表达自然度 30%。只把确实影响含义或明显不自然的表达列为错误；符合场景的标准敬语不要要求用户改成更复杂或过度正式的说法。\n' +
    'highlights 写学生做得好的 2-3 点；improvements 写 2-3 条具体、符合初学者水平的建议；summary 一句话总评（中文，40 字内）。任何韩语单词或短语后都紧跟中文释义，例如「하나（一个）」。\n' +
    '只输出一个 JSON 对象，不要任何其他文字：\n' +
    '{"score": 0到100的整数, "highlights": ["亮点1"], "improvements": ["改进1"], "summary": "一句话总评"}';

  let report = null;
  try {
    const raw = await llm.chatText([{ role: 'user', content: prompt }], 0.5);
    const parsed = llm.extractJSON(raw);
    if (parsed && typeof parsed.score === 'number') {
      report = {
        scene: scene.id,
        scene_name: scene.name,
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        highlights: (Array.isArray(parsed.highlights) ? parsed.highlights : []).slice(0, 3).map(String),
        improvements: (Array.isArray(parsed.improvements) ? parsed.improvements : []).slice(0, 3).map(String),
        summary: String(parsed.summary || '').slice(0, 80),
        at: new Date().toISOString()
      };
    }
  } catch (e) {
    console.warn('[scenario] 复盘生成失败：', e.message);
  }
  if (!report) return { ok: false, error: 'AI 复盘生成失败，请重试（对话不受影响）' };

  // 落库 + 结束场景
  const reports = doc.progress.scenario_reports || (doc.progress.scenario_reports = []);
  reports.push(report);
  if (reports.length > 20) doc.progress.scenario_reports = reports.slice(-20);
  doc.session.scenario = null;
  doc.session.mode = '';
  store.saveUser(doc);
  return { ok: true, report };
}

// —— 结构化学习报告（Phase 10）：纯本地数据引擎为主，AI 评语为可选增强——
// 设计原则：数据部分 100% 来自落库行为（周统计/纠错/趋势快照/跟读/情景），
// AI 只负责「评语 + 下次重点」的定性生成；AI 不可用时报告依然完整可展示。
async function handleReport({ userId }) {
  const doc = store.loadUser(userId);
  const pr = doc.progress || {};
  const st = doc.stats || {};
  const weekly = weekStats(st);

  const errLog = pr.error_log || [];
  const activeErrs = errLog.filter((e) => e.status !== 'mastered');
  const masteredErrs = errLog.length - activeErrs.length;

  const pronLog = pr.pron_eval_log || [];
  const pronAvg = pronLog.length ? Math.round(pronLog.reduce((s, e) => s + (e.score || 0), 0) / pronLog.length) : null;

  const scReports = pr.scenario_reports || [];
  const vocab = pr.vocab || [];
  const dueN = vocab.filter((v) => v.due_at && new Date(v.due_at).getTime() <= Date.now()).length;

  // 能力趋势：score_history 首条 vs 最新一条（评分快照 ≥2 才有对比）
  const hist = pr.score_history || [];
  const trend = [];
  if (hist.length >= 2) {
    const first = hist[0];
    const last = hist[hist.length - 1];
    for (const d of ABILITY_DIMS) {
      const a = first[d.key];
      const b = last[d.key];
      if (a != null && b != null) trend.push({ key: d.key, label: d.label, from: a, to: b, delta: b - a });
    }
  }

  const report = {
    at: new Date().toISOString(),
    level: (doc.profile || {}).level || '',
    streak: weekly.streak_days,
    week: {
      minutes_est: weekly.week_minutes_est,
      turns: weekly.week_turns,
      errors: weekly.week_errors,
      words: weekly.week_words,
      pron: weekly.week_pron
    },
    // 按错误出现频率排序（同频次按最近时间），取前 5 —— 保证「高频错误」名副其实
    top_errors: activeErrs
      .slice()
      .sort((a, b) => (b.count || 1) - (a.count || 1) || String(b.last || '').localeCompare(String(a.last || '')))
      .slice(0, 5)
      .map((e) => ({
        point: e.point || e.wrong,
        wrong: e.wrong,
        right: e.right || '',
        count: e.count || 1
      })),
    mastered_errors: masteredErrs,
    grammar_mastered: (pr.grammar_mastered || []).length,
    vocab_total: vocab.length,
    vocab_due: dueN,
    pron_tries: pronLog.length,
    pron_avg: pronAvg,
    scenario_count: scReports.length,
    scenario_last: scReports.length ? scReports[scReports.length - 1].score : null,
    trend,
    ai_comment: '',
    next_focus: []
  };

  // AI 定性评语 + 下次重点（可选增强，失败不影响报告）
  try {
    const prompt =
      '你是韩语学习教练。请根据以下真实学习数据，给出一段 60 字内的中文评语（先肯定再指出改进方向，不要泛泛而谈），' +
      '并给出「下次重点」最多 3 个具体的知识点/训练方向。\n' +
      '学习数据：' + JSON.stringify({
        level: report.level,
        week: report.week,
        streak: report.streak,
        top_errors: report.top_errors,
        mastered_errors: report.mastered_errors,
        trend: report.trend,
        pron: { tries: report.pron_tries, avg: report.pron_avg },
        scenario: { count: report.scenario_count, last_score: report.scenario_last }
      }) + '\n' +
      '只输出一个 JSON 对象，不要任何其他文字：{"comment": "评语", "focus": ["知识点1", "知识点2"]}';
    const raw = await llm.chatText([{ role: 'user', content: prompt }], 0.6);
    const parsed = llm.extractJSON(raw);
    if (parsed) {
      report.ai_comment = String(parsed.comment || '').slice(0, 120);
      report.next_focus = (Array.isArray(parsed.focus) ? parsed.focus : []).slice(0, 3).map(String);
    }
  } catch (e) {
    console.warn('[report] AI 评语生成失败（报告数据版不受影响）：', e.message);
  }

  return { report };
}

// —— Demo 模式（Phase 12）：预置剧本 + 真实状态管线 ——
// 演示数据写入独立档案（demo_ 前缀），与真实用户完全隔离；
// 每一步 state 都经过 applyStatePatch，纠错卡/掌握卡/复盘卡由真实系统逻辑渲染。
function demoDocId(userId) {
  return 'demo_' + String(userId).slice(0, 48);
}

function handleDemoNext({ userId }) {
  const doc = store.loadUser(demoDocId(userId));
  if (!doc.demo) doc.demo = { step: 0 };
  doc.demo.at = new Date().toISOString();

  const idx = doc.demo.step;
  const step = demo.stepAt(idx);
  if (!step) return { ok: false, error: '演示已结束' };

  const state = step.reply.state || {};
  applyStatePatch(doc, state);
  touchStats(doc, { turns: 1, errors: (state.errors || []).length });
  if (step.user) doc.messages.push({ role: 'user', content: step.user.slice(0, 600) });
  doc.messages.push({ role: 'assistant', content: step.reply.display.slice(0, 600) });
  if (doc.messages.length > 30) doc.messages = doc.messages.slice(-30);
  doc.demo.step = idx + 1;
  store.saveUser(doc);

  return {
    ok: true,
    user_line: step.user || '',
    display: step.reply.display,
    speech: step.reply.speech || '',
    errors: cardErrors(state),
    mastered: masteredEvents(doc, state),
    report: step.reply.report || null,
    finished: !demo.stepAt(idx + 1),
    total: demo.total(),
    step: idx + 1
  };
}

function handleDemoReset({ userId }) {
  const doc = store.loadUser(demoDocId(userId));
  doc.demo = { step: 0, at: new Date().toISOString() };
  doc.messages = [];
  doc.session = doc.session || {};
  doc.session.mode = '';
  doc.session.scenario = null;
  // 清空演示进度数据，保证每次演示从同一初始状态开始
  doc.profile.level = '';
  doc.profile.goal = '';
  doc.profile.interests = [];
  doc.progress.vocab = [];
  doc.progress.error_log = [];
  doc.progress.weak_points = [];
  doc.progress.grammar_mastered = [];
  doc.progress.grammar_learning = [];
  doc.progress.quality_log = [];
  doc.progress.pron_eval_log = [];
  doc.progress.pron_mastered = [];
  doc.progress.scenario_reports = [];
  doc.progress.scores = null;
  doc.progress.score_history = [];
  doc.stats.daily = {};
  doc.stats.streak_days = 0;
  doc.stats.last_active_date = '';
  store.saveUser(doc);
  return { ok: true };
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
        similar: Array.isArray(q.similar) ? q.similar.slice(0, 3) : [],
        color: Array.isArray(q.color) && q.color.length >= 2 ? [String(q.color[0]), String(q.color[1])] : ['#EAF3FF', '#DCEAFF']
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

/* =========================================================
   学习画像引擎（Phase 4）
   原则：评分只来自真实行为数据；缺证据的维度为 null（前端显示「待评估」）。
   每个维度都能回答：输入是什么 → 怎么算的 → 依据是什么。
   ========================================================= */

const ABILITY_DIMS = [
  { key: 'vocabulary', label: '词汇', weight: 0.2 },
  { key: 'grammar', label: '语法', weight: 0.25 },
  { key: 'pronunciation', label: '发音', weight: 0.2 },
  { key: 'fluency', label: '流畅度', weight: 0.175 },
  { key: 'naturalness', label: '自然度', weight: 0.175 }
];

const clampScore = (v) => Math.max(20, Math.min(96, Math.round(v)));

// 活跃统计：每日 {turns, errors, new_words, pron_tries}，保留 90 天，自动重算连胜
function touchStats(doc, delta) {
  const st = doc.stats || (doc.stats = { daily: {}, streak_days: 0, last_active_date: '' });
  st.daily = st.daily || {};
  const day = today();
  const d = st.daily[day] || (st.daily[day] = { turns: 0, errors: 0, new_words: 0, pron_tries: 0 });
  d.turns += delta.turns || 0;
  d.errors += delta.errors || 0;
  d.new_words += delta.newWords || 0;
  d.pron_tries += delta.pronTries || 0;
  st.last_active_date = day;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(st.daily)) if (k < cutoff) delete st.daily[k];
  st.streak_days = recomputeStreak(st.daily, day);
}

function recomputeStreak(daily, activeDay) {
  const active = Object.keys(daily)
    .filter((k) => {
      const d = daily[k];
      return (d.turns || 0) + (d.pron_tries || 0) > 0;
    })
    .sort();
  if (!active.length) return 0;
  const last = active[active.length - 1];
  const gap = Math.round((new Date(activeDay + 'T00:00:00Z').getTime() - new Date(last + 'T00:00:00Z').getTime()) / 86400000);
  if (gap > 1) return 0; // 昨天以前未活跃 → 连胜中断
  let streak = 1;
  for (let i = active.length - 2; i >= 0; i--) {
    const diff = (new Date(active[i + 1] + 'T00:00:00Z').getTime() - new Date(active[i] + 'T00:00:00Z').getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// 跟读评分落库：发音维度唯一硬数据来源（ASR 识别 + AI 评分）
function recordPronEval(doc, target, score, advice, asrText, source) {
  const log = doc.progress.pron_eval_log || (doc.progress.pron_eval_log = []);
  log.push({
    target: String(target || '').slice(0, 60),
    score,
    advice: String(advice || '').slice(0, 120),
    asr: String(asrText || '').slice(0, 60),
    source: source || 'ai',
    at: new Date().toISOString()
  });
  if (log.length > 60) doc.progress.pron_eval_log = log.slice(-60);
  touchStats(doc, { pronTries: 1 });
}

// 「我会了」持久化（Phase 9）：用户自评掌握某句的真实行为，落库并返回最新计数
function markPronMastered(userId, target) {
  const doc = store.loadUser(userId);
  const list = doc.progress.pron_mastered || (doc.progress.pron_mastered = []);
  const t = String(target || '').trim().slice(0, 60);
  if (t && !list.includes(t)) {
    list.push(t);
    if (list.length > 100) doc.progress.pron_mastered = list.slice(-100);
    store.saveUser(doc);
  }
  return { mastered: doc.progress.pron_mastered.length };
}

// ===== K-pop 歌词学习（歌曲识别候选 + 歌词结构化划分 + 保存 + 生词入本）=====
// 设计（可答辩边界）：
// - 歌名由 AI 给出「候选」（标题/歌手/置信度），最终以用户确认为准 —— 不硬猜错歌，也不谎称「AI 识别成功」
// - 歌词划分（分句/罗马音/翻译/词汇）由 LLM 结构化输出，代码侧做字段截断与行数封顶兜底
// - 跟读评分复用 /api/pronounce 真实链路（ASR+AI），落库 pron_eval_log → 发音维度真实涨分
// 默认只分析 24 句，显著减少模型输出 token；可通过环境变量 SONG_MAX_LINES 恢复到最多 40 句。
const SONG_MAX_LINES = Math.max(12, Math.min(40, Number(process.env.SONG_MAX_LINES) || 24));
const clampStr = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function normalizeSongLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l) => l && l.ko)
    .slice(0, SONG_MAX_LINES)
    .map((l) => ({
      ko: clampStr(l.ko, 80),
      romanization: clampStr(l.romanization || l.roman || l.romanization_text, 120),
      translation: clampStr(l.translation || l.zh || l.meaning, 80),
      grammar: clampStr(l.grammar || l.grammar_point || l.explain, 80),
      vocab: (Array.isArray(l.vocab) ? l.vocab : (Array.isArray(l.words) ? l.words : []))
        .filter((v) => v && (v.ko || v.word))
        .slice(0, 4)
        .map((v) => ({ ko: clampStr(v.ko || v.word, 20), zh: clampStr(v.zh || v.meaning || v.explain, 30) }))
    }));
}

function songLineNeedsEnrichment(line) {
  if (!line || !line.ko) return false;
  const roman = line.romanization || line.roman || line.romanization_text;
  const translation = line.translation || line.zh || line.meaning;
  const grammar = line.grammar || line.grammar_point || line.explain;
  const vocab = Array.isArray(line.vocab) ? line.vocab : (Array.isArray(line.words) ? line.words : []);
  return !roman || !translation || !grammar || !vocab.length;
}

async function enrichSongParsed(parsed) {
  if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.length) return parsed;
  const lines = parsed.lines.slice(0, SONG_MAX_LINES);
  if (!lines.some(songLineNeedsEnrichment)) return parsed;
  let enriched = null;
  try {
    enriched = await llm.enrichSongLines(lines);
  } catch (e) {
    console.warn('[song] 学习字段补全异常：', e.message);
  }
  if (!Array.isArray(enriched) || !enriched.length) return parsed;
  const byIndex = new Map(enriched.map((line, index) => [Number.isInteger(line && line.index) ? line.index : index, line]));
  parsed.lines = lines.map((line, index) => {
    const extra = byIndex.get(index) || {};
    return Object.assign({}, line, extra, { ko: line.ko });
  });
  return parsed;
}

// 分析歌词：图片由 VLM 一次性输出结构化结果，文本由 LLM 输出；不落库（等待用户确认歌名）。
async function handleSongAnalyze({ text, imageB64, source, songMeta }) {
  const inputSource = source || (imageB64 ? 'image' : 'paste');
  let raw = clampStr(text || '', 12000);
  let parsed = null;

  // 图片原来要串行调用「VLM OCR -> LLM 结构化」，现在一次 VLM 直接返回结构化结果。
  // 这会少一次模型排队和一次完整输出传输，是图片分析提速的主要来源。
  if (imageB64) {
    try {
      const out = await llm.analyzeSongImage(imageB64, SONG_MAX_LINES);
      parsed = llm.extractJSON(out);
    } catch (e) {
      console.warn('[song] VLM 结构化分析失败，回退 OCR：', e.message);
    }
    // 只有直出 JSON 失败时才走旧的两步回退链路，正常请求不会触发。
    if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.length) {
      parsed = null;
      try {
        raw = (await llm.analyzeImage(imageB64)).trim();
      } catch (e) {
        console.warn('[song] 图片 OCR 失败：', e.message);
      }
    }
  }

  if (!parsed) {
    raw = raw.trim();
    if (!raw) throw new Error('没有识别到歌词内容，换一张更清晰的图片试试');

    const prompt =
      '你是韩语歌词学习教练。下面是用户明确提供的歌词原文。请严格只分析这段材料，不要联网猜歌，不要根据歌名、歌手或歌词片段补写任何材料外的歌词。' +
      (inputSource === 'lrc' ? '其中【LRC 元数据】只用于提取歌名/歌手，【LRC 歌词原文】之后才是歌词；元数据和分隔标记都不能放入 lines。\n' : '\n') +
      '请只输出一个 JSON 对象，不要任何其他文字：\n' +
      '{\n' +
      '  "summary": "只总结用户提供的原文内容，不得补充原文外信息",\n' +
      '  "candidates": [{"title": "歌名", "artist": "歌手", "confidence": 0到1之间的小数}],\n' +
      '  "lines": [\n' +
      '    {"ko": "韩语原文一句", "romanization": "罗马音（给中国初学者，按音节连写）", "translation": "中文翻译", "grammar": "本句最值得学的一个语法点简述（可空）", "vocab": [{"ko": "单词", "zh": "中文释义"}]}\n' +
      '  ]\n' +
      '}\n' +
      '要求：\n' +
      '1. candidates 只允许提取这段材料中明确出现的歌名和歌手；材料没有明确歌名/歌手时必须输出空数组，禁止根据歌词内容猜歌。\n' +
      '2. 如果材料第一行是「歌名 - 歌手」标题行，可以提取为 candidates；标题行不是歌词，不要放进 lines。\n' +
      '3. lines 只能来自这段材料中实际出现的歌词，按原顺序保留，最多 ' + SONG_MAX_LINES + ' 句；不要去网上补全、不要补写下一句、不要擅自添加重复副歌。\n' +
      '4. 每句必须填写 romanization、translation、grammar；vocab 至少给 2 个来自本句的核心词，不能只返回 ko。\n' +
      '5. romanization 用英文小写并按音节用连字符拼读，方便中国零基础学生直读。\n' +
      '6. grammar 用中文只解释本句实际出现的语法，translation 用自然简短中文。\n' +
      '7. summary 用中文概括这段原文表达的主题或情绪；原文太短时如实说明，不要根据歌名或常识猜测。\n\n' +
      '用户提供的原文（只能分析以下内容）：\n' + raw;

    try {
      const out = await llm.chatText([{ role: 'user', content: prompt }], 0.4);
      parsed = llm.extractJSON(out);
    } catch (e) {
      console.warn('[song] LLM 歌词分析失败：', e.message);
    }
  }
  // 兜底：模型没给结构化结果时，按行切分韩文原文（罗马音/翻译留空，前端只展示可跟读的原文）
  if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.length) {
    parsed = {
      candidates: [],
      lines: raw
        .split(/\n+/)
        .map((s) => ({ ko: clampStr(s, 80), romanization: '', translation: '', grammar: '', vocab: [] }))
        .filter((l) => l.ko && /[\uAC00-\uD7A3]/.test(l.ko))
        .slice(0, SONG_MAX_LINES)
    };
  }

  // 视觉模型若只识别出韩文，补一轮轻量学习字段，确保零基础用户不会只看到原文。
  parsed = await enrichSongParsed(parsed);
  const modelCandidates = (Array.isArray(parsed.candidates) ? parsed.candidates : [])
    .slice(0, 3)
    .map((c) => ({
      title: clampStr(c && c.title, 60),
      artist: clampStr(c && c.artist, 40),
      confidence: Math.max(0, Math.min(1, Number(c && c.confidence) || 0))
    }))
    .filter((c) => c.title);
  const explicitCandidate = songMeta && (songMeta.title || songMeta.artist)
    ? [{ title: clampStr(songMeta.title, 60), artist: clampStr(songMeta.artist, 40), confidence: 1 }]
    : [];
  const candidates = explicitCandidate.concat(modelCandidates.filter((candidate) =>
    !explicitCandidate.some((explicit) => explicit.title && explicit.title === candidate.title)
  )).slice(0, 3);
  return {
    summary: clampStr(parsed.summary || parsed.overview || parsed.theme, 160),
    candidates,
    lines: normalizeSongLines(parsed.lines),
    mode: inputSource,
    source: inputSource
  };
}

// 保存歌词课程：歌名为用户确认后的值（或用户手输），这是「真实数据」而非 AI 猜的
function handleSongSave({ userId, title, artist, summary, lines }) {
  const t = clampStr(title, 60);
  if (!t) throw new Error('歌名不能为空');
  const clean = normalizeSongLines(lines);
  if (!clean.length) throw new Error('歌词为空，无法保存');
  const doc = store.loadUser(userId);
  const list = doc.progress.song_lessons || (doc.progress.song_lessons = []);
  const song = {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: t,
    artist: clampStr(artist, 40),
    summary: clampStr(summary, 160),
    lines: clean,
    at: new Date().toISOString()
  };
  list.push(song);
  doc.progress.song_lessons = list.slice(-30);
  store.saveUser(doc);
  return { ok: true, song };
}

// 歌词生词一键入本：复用聊天同款 SRS 逻辑；仅「新词」计入每日统计，重复添加只增加熟悉度
function handleSongVocab({ userId, ko, zh }) {
  const word = clampStr(ko, 20);
  if (!word) throw new Error('生词不能为空');
  const doc = store.loadUser(userId);
  const pr = doc.progress;
  const found = pr.vocab.find((x) => x.ko === word);
  if (found) {
    found.seen = (found.seen || 1) + 1;
    store.saveUser(doc);
    return { ok: true, added: false, total: pr.vocab.length };
  }
  applyStatePatch(doc, { vocab_add: [{ ko: word, zh: clampStr(zh, 30) }] });
  touchStats(doc, { newWords: 1 });
  store.saveUser(doc);
  return { ok: true, added: true, total: pr.vocab.length };
}

function handleSongList(userId) {
  const doc = store.loadUser(userId);
  const songs = (doc.progress.song_lessons || []).slice(-30).reverse();
  return {
    songs: songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, lineCount: (s.lines || []).length, at: s.at }))
  };
}

function handleSongDelete(userId, songId) {
  const id = clampStr(songId, 80);
  if (!id) throw new Error('歌曲 ID 不能为空');
  const doc = store.loadUser(userId);
  const list = doc.progress.song_lessons || [];
  const index = list.findIndex((song) => song && song.id === id);
  if (index < 0) throw new Error('歌曲不存在或已被删除');
  const removed = list[index];
  list.splice(index, 1);
  doc.progress.song_lessons = list;
  store.saveUser(doc);
  return { ok: true, deletedId: id, title: removed.title || '' };
}

async function handleSongGet(userId, songId) {
  const doc = store.loadUser(userId);
  const song = (doc.progress.song_lessons || []).find((s) => s.id === songId);
  if (!song) throw new Error('歌曲不存在或已被清理');

  // 兼容在加入罗马音/语法分析前保存的旧歌曲：打开时自动补全并持久化。
  const before = JSON.stringify(song.lines || []);
  const parsed = await enrichSongParsed({ lines: song.lines || [] });
  const normalized = normalizeSongLines(parsed.lines || []);
  song.lines = normalized;
  if (JSON.stringify(normalized) !== before) {
    store.saveUser(doc);
  }
  return { song };
}

// 能力评分计算：纯代码公式 + 真实数据，输出各维度分数或 null（证据不足）
function computeScores(doc) {
  const pr = doc.progress || {};
  const scores = { vocabulary: null, grammar: null, pronunciation: null, fluency: null, naturalness: null };
  const basis = {};

  // 发音：最近评分加权（近 3 次占 60%）
  const pronLog = (pr.pron_eval_log || []).slice(-10);
  if (pronLog.length >= 1) {
    const avg = pronLog.reduce((s, e) => s + (e.score || 0), 0) / pronLog.length;
    const recent = pronLog.slice(-3);
    const recentAvg = recent.reduce((s, e) => s + (e.score || 0), 0) / recent.length;
    scores.pronunciation = clampScore(avg * 0.4 + recentAvg * 0.6);
    basis.pronunciation = '基于最近 ' + pronLog.length + ' 次跟读评分（ASR+AI 评测）';
  }

  // 语法：掌握语法加分、纠错记录减分（数据驱动估算）
  const mastered = (pr.grammar_mastered || []).length;
  const errN = (pr.error_log || []).length;
  if (mastered > 0 || errN > 0) {
    scores.grammar = clampScore(50 + Math.min(mastered, 6) * 6 - Math.min(errN, 12) * 2.5);
    basis.grammar = '已掌握 ' + mastered + ' 个语法 · ' + errN + ' 条纠错记录';
  }

  // 词汇：SRS 词汇库规模 + 进入复习的词数
  const vocab = pr.vocab || [];
  const known = vocab.filter((v) => (v.seen || 0) >= 2 || (v.srs_stage || 0) >= 2).length;
  if (vocab.length >= 3) {
    scores.vocabulary = clampScore(30 + Math.min(known, 30) * 2 + Math.min(Math.max(vocab.length - known, 0), 20) * 0.5);
    basis.vocabulary = '收录 ' + vocab.length + ' 词 · 进入复习 ' + known + ' 词';
  }

  // 流畅度 / 自然度：对话 AI 定性评估累积（quality_log，容忍缺项）
  const qual = pr.quality_log || [];
  const fluVals = qual.slice(-8).map((e) => e.fluency).filter((v) => typeof v === 'number' && v > 0);
  const natVals = qual.slice(-8).map((e) => e.naturalness).filter((v) => typeof v === 'number' && v > 0);
  if (fluVals.length >= 3) {
    scores.fluency = clampScore(fluVals.reduce((s, v) => s + v, 0) / fluVals.length);
    basis.fluency = '基于 ' + fluVals.length + ' 轮对话的 AI 定性评估';
  }
  if (natVals.length >= 3) {
    scores.naturalness = clampScore(natVals.reduce((s, v) => s + v, 0) / natVals.length);
    basis.naturalness = '基于 ' + natVals.length + ' 轮对话的 AI 定性评估';
  }

  // 综合：≥3 个维度有证据才给出总分（权重按可用维度归一）
  const available = ABILITY_DIMS.filter((d) => scores[d.key] != null);
  if (available.length >= 3) {
    const wSum = available.reduce((s, d) => s + d.weight, 0);
    const overall = available.reduce((s, d) => s + scores[d.key] * d.weight, 0) / wSum;
    scores.overall = Math.round(overall);
    basis.overall = '综合 ' + available.length + ' 项可评估维度';
  }

  const result = { ...scores, basis };
  persistScores(doc, result);
  return result;
}

// 分数变化 ≥2 分才落库 + 写趋势快照（最多 30 条）
// 完全无证据（所有维度 null）时不落库：保持「未评估」原始态，不产生虚假的评估时间
function persistScores(doc, scores) {
  const hasAny = ABILITY_DIMS.some((d) => scores[d.key] != null);
  if (!hasAny) return;
  const old = doc.progress.scores;
  const changed = !old || ABILITY_DIMS.some((d) => Math.abs(((old[d.key] == null ? null : old[d.key]) || 0) - (scores[d.key] == null ? 0 : scores[d.key])) >= 2) || (old.overall == null) !== (scores.overall == null);
  if (!changed) return;
  const snap = { at: new Date().toISOString(), ...scores };
  doc.progress.scores = snap;
  const hist = doc.progress.score_history || (doc.progress.score_history = []);
  hist.push({ at: snap.at, overall: scores.overall, vocabulary: scores.vocabulary, grammar: scores.grammar, pronunciation: scores.pronunciation, fluency: scores.fluency, naturalness: scores.naturalness });
  if (hist.length > 30) doc.progress.score_history = hist.slice(-30);
  store.saveUser(doc);
}

// 近 7 日统计（学习报告/首页用；minutes 为按对话轮数估算口径，每轮约 0.75 分钟）
function weekStats(st) {
  let weekTurns = 0, weekErrors = 0, weekWords = 0, weekPron = 0;
  const daily = st.daily || {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const rec = daily[d];
    if (rec) {
      weekTurns += rec.turns || 0;
      weekErrors += rec.errors || 0;
      weekWords += rec.new_words || 0;
      weekPron += rec.pron_tries || 0;
    }
  }
  return {
    streak_days: st.streak_days || 0,
    week_turns: weekTurns,
    week_minutes_est: Math.round(weekTurns * 0.75),
    week_errors: weekErrors,
    week_words: weekWords,
    week_pron: weekPron
  };
}

// 能力画像 API 出口：懒计算 + 变化落库
function getAbilities(userId) {
  const doc = store.loadUser(userId);
  const scores = computeScores(doc);
  return {
    level: (doc.profile || {}).level || '',
    dims: ABILITY_DIMS.map((d) => ({
      key: d.key,
      label: d.label,
      score: scores[d.key] == null ? null : scores[d.key],
      basis: (scores.basis && scores.basis[d.key]) || ''
    })),
    overall: scores.overall == null ? null : scores.overall,
    overallBasis: (scores.basis && scores.basis.overall) || '',
    updatedAt: (doc.progress.scores && doc.progress.scores.at) || null,
    history: doc.progress.score_history || [],
    stats: weekStats(doc.stats || {}),
    pronLog: (doc.progress.pron_eval_log || []).slice(-5)
  };
}

module.exports = { handleChat, handleUpload, handlePronounce, handleChatStream, handleScenarioEnd, handleLessons, handleDramaQuotes, handleReport, handleDemoNext, handleDemoReset, handleSongAnalyze, handleSongSave, handleSongVocab, handleSongList, handleSongDelete, handleSongGet, archiveSession, extractKoreanSentences, applyStatePatch, applySelfReportedLevel, candidateEvidenceTurns, normalizeOut, hasUntranslatedKoreanSentence, isSevereUntranslated, untranslatedKoreanStats, hasMeaningfulKorean, directBeginnerPhraseReply, recordLearnerEvidence, touchStats, recordPronEval, markPronMastered, getAbilities, computeScores, computeDifficulty };
