// OpenAI 兼容的多模态客户端：LLM / 视觉（VLM）/ ASR / TTS
// 未配置对应 API Key 时自动进入 mock 模式，方便前端先跑通交互。
require('dotenv').config();
const fs = require('fs');
const OpenAI = require('openai');

const clients = new Map();
function client(baseURL, apiKey) {
  const key = (baseURL || '') + '|' + (apiKey || '');
  if (!clients.has(key)) {
    clients.set(key, new OpenAI({ baseURL, apiKey, timeout: 90000, maxRetries: 1 }));
  }
  return clients.get(key);
}

const LLM = {
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'glm-4-flash'
};
const VISION_MODEL = process.env.VISION_MODEL || 'glm-4v-flash';
const ASR = {
  enabled: !!(process.env.ASR_API_KEY && process.env.ASR_BASE_URL),
  baseURL: process.env.ASR_BASE_URL,
  apiKey: process.env.ASR_API_KEY,
  model: process.env.ASR_MODEL || 'whisper-large-v3'
};
const TTS = {
  enabled: !!(process.env.TTS_API_KEY && process.env.TTS_BASE_URL),
  baseURL: process.env.TTS_BASE_URL,
  apiKey: process.env.TTS_API_KEY,
  model: process.env.TTS_MODEL || 'FunAudioLLM/CosyVoice2-0.5B',
  voice: process.env.TTS_VOICE || ''
};

function caps() {
  return { llm: !!LLM.apiKey, vision: !!LLM.apiKey, asr: ASR.enabled, tts: !!edgeTtsLib || TTS.enabled, edge_tts: !!edgeTtsLib };
}

// —— 宽容 JSON 提取：模型偶尔在 JSON 外带说明文字或代码围栏 ——
function extractJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  if (start === -1) return null;
  for (let end = t.lastIndexOf('}'); end > start; end = t.lastIndexOf('}', end - 1)) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch (e) {
      /* 继续向内收缩 */
    }
  }
  return null;
}

function mockChat(userText) {
  const said = String(userText || '').slice(0, 60);
  return JSON.stringify({
    speech:
      '안녕하세요! 지금은 데모 모드예요. 서버의 .env 파일에 LLM_API_KEY 를 설정하면 진짜 한국어 선생님이 대답할 거예요!',
    display:
      '⚠️ 演示模式：后端还没有配置 LLM_API_KEY。\n\n复制 server/.env.example 为 .env，填入智谱 GLM 或其他 OpenAI 兼容服务的 Key 后重启即可。\n\n你刚才说的是：「' +
      said +
      '」\n配置好后，我就会用韩语陪你聊天、纠错、带你练发音啦！',
    state_patch: {},
    ui_hints: {}
  });
}

// —— 并发排队 + 限流重试：免费档模型并发/RPM 限制严格，排队等待比直接报错体验好 ——
const MAX_CONCURRENT = 2;
let activeCalls = 0;
const waitQueue = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquireSlot() {
  if (activeCalls < MAX_CONCURRENT) {
    activeCalls++;
    return;
  }
  await new Promise((resolve) => waitQueue.push(resolve));
  activeCalls++;
}

function releaseSlot() {
  activeCalls--;
  const next = waitQueue.shift();
  if (next) next();
}

async function createWithRetry(body, maxTokens) {
  body.max_tokens = maxTokens;
  let lastErr = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    await acquireSlot();
    try {
      const res = await client(LLM.baseURL, LLM.apiKey).chat.completions.create(body);
      return (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
    } catch (e) {
      lastErr = e;
      const st = (e && e.status) || 0;
      const retryable = st === 429 || st === 500 || st === 502 || st === 503;
      if (!retryable) throw e;
      if (attempt === 2 && st === 429) {
        const err = new Error('AI 老师有点忙（免费额度限流），请等 10 秒再发送');
        err.status = 429;
        throw err;
      }
    } finally {
      releaseSlot();
    }
    if (attempt < 2) await sleep(2000 * (attempt + 1));
  }
  throw lastErr || new Error('LLM 调用失败');
}

async function chatText(messages, temperature) {
  if (!LLM.apiKey) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const content = lastUser && typeof lastUser.content === 'string' ? lastUser.content : '';
    return mockChat(content);
  }
  const body = {
    model: LLM.model,
    messages,
    temperature: temperature == null ? 0.7 : temperature
  };
  // GLM-4.5 系列默认开启思考模式，对话场景关闭以保证响应速度
  if (LLM.model.includes('4.5')) body.thinking = { type: 'disabled' };
  return createWithRetry(body, 1000);
}

async function chatJSON(messages) {
  const text = await chatText(messages, 0.7);
  const parsed = extractJSON(text);
  if (parsed && (parsed.speech || parsed.display)) return parsed;
  // 模型没按协议输出时整体降级为纯文本回复
  return { speech: text.slice(0, 300), display: text, state_patch: {}, ui_hints: {} };
}

// 流式对话：逐增量回调 onDelta，返回完整文本。
// 首块未产出前的 429/5xx 会自动重试；已开始输出后的失败直接抛出（前端保留已收文本）。
async function chatStream(messages, { temperature, maxTokens, onDelta } = {}) {
  if (!LLM.apiKey) {
    const mock = mockChat((messages.find((m) => m.role === 'user') || {}).content || '');
    const parsed = extractJSON(mock);
    const text = (parsed && parsed.display) || mock;
    if (onDelta) onDelta(text);
    return text;
  }
  const buildBody = () => {
    const body = {
      model: LLM.model,
      messages,
      stream: true,
      temperature: temperature == null ? 0.7 : temperature,
      max_tokens: maxTokens || 800 // 不设会导致回复长度不受控、流式时间被拉长
    };
    if (LLM.model.includes('4.5')) body.thinking = { type: 'disabled' };
    return body;
  };

  let lastErr = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    await acquireSlot();
    let emitted = false;
    let full = '';
    try {
      const stream = await client(LLM.baseURL, LLM.apiKey).chat.completions.create(buildBody());
      for await (const chunk of stream) {
        const delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || '';
        if (delta) {
          emitted = true;
          full += delta;
          if (onDelta) {
            try { onDelta(delta); } catch (e) { /* 回调异常不中断流 */ }
          }
        }
      }
      return full;
    } catch (e) {
      lastErr = e;
      const st = (e && e.status) || 0;
      const retryable = st === 429 || st === 500 || st === 502 || st === 503;
      if (emitted || !retryable) {
        if (st === 429) {
          const err = new Error('AI 老师有点忙（免费额度限流），请等 10 秒再发送');
          err.status = 429;
          throw err;
        }
        throw e;
      }
    } finally {
      releaseSlot();
    }
    if (attempt < 2) await sleep(2000 * (attempt + 1));
  }
  if (lastErr && lastErr.status === 429) {
    const err = new Error('AI 老师有点忙（免费额度限流），请等 10 秒再发送');
    err.status = 429;
    throw err;
  }
  throw lastErr || new Error('LLM 流式调用失败');
}

async function visionCall(content) {
  const body = { model: VISION_MODEL, messages: [{ role: 'user', content }] };
  if (VISION_MODEL.includes('4.5')) body.thinking = { type: 'disabled' };
  return createWithRetry(body, 700);
}

// 视觉：口型/表情分析（视频通道）
async function analyzeFrame(base64) {
  if (!LLM.apiKey) return '（演示模式：未配置视觉模型，跳过口型分析）';
  return visionCall([
    {
      type: 'text',
      text:
        '这是一位韩语学习者对着摄像头说韩语的一帧画面。请只从发音教学角度分析：1) 口型（开口度、是否圆唇、嘴角是否平展）；2) 表情状态（困惑/自信/疲劳）。输出中文，60 字以内，不评价外貌。'
    },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }
  ]);
}

// 视觉：图片材料 OCR + 教学材料提取（文件上传）
async function analyzeImage(base64) {
  if (!LLM.apiKey) return '（演示模式：未配置视觉模型，无法识别图片内容）';
  return visionCall([
    {
      type: 'text',
      text:
        '请完整提取这张图片中的韩文内容（若是菜单/路牌/歌词/教材页面，保留原文与排版顺序），在每句韩文后附中文翻译。只输出提取与翻译结果，不要额外讲解。'
    },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }
  ]);
}

// 韩语语音识别（微信同声传译插件不支持韩语，必须走这里）
async function transcribe(filePath) {
  if (!ASR.enabled) return '';
  const res = await client(ASR.baseURL, ASR.apiKey).audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: ASR.model
  });
  return (res && res.text) || '';
}

// —— 韩语语音合成：云 TTS 优先，失败自动回退 macOS 本地 say（Yuna 韩语音色）——
const { execFile } = require('child_process');
const os = require('os');

const SAY_VOICE = process.env.SAY_VOICE || 'Yuna';   // macOS 内置韩语音色
const SAY_RATE = process.env.SAY_RATE || '150';      // 学习者友好的稍慢语速
let cloudTtsCooldownUntil = 0;                       // 云 TTS 失败后 10 分钟内直接走本地，避免每次白等

// launchd 环境的 PATH 很精简，ffmpeg/say 必须用绝对路径
const SAY_BIN = ['/usr/bin/say', 'say'].find((p) => {
  try { fs.accessSync(p.startsWith('/') ? p : '/', fs.constants.X_OK); return p.startsWith('/'); } catch (e) { return false; }
}) || 'say';
const FFMPEG_BIN = [process.env.FFMPEG_PATH, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']
  .filter(Boolean)
  .find((p) => { try { return fs.accessSync(p, fs.constants.X_OK) === undefined; } catch (e) { return false; } }) || 'ffmpeg';

function localSay(text) {
  return new Promise((resolve) => {
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const aiff = os.tmpdir() + `/kfp_say_${id}.aiff`;
    const mp3 = os.tmpdir() + `/kfp_say_${id}.mp3`;
    const cleanup = () => { try { fs.unlinkSync(aiff); } catch (e) {} try { fs.unlinkSync(mp3); } catch (e) {} };
    execFile(SAY_BIN, ['-v', SAY_VOICE, '-r', SAY_RATE, String(text).slice(0, 300), '-o', aiff], (err) => {
      if (err) { cleanup(); return resolve(null); }
      execFile(FFMPEG_BIN, ['-y', '-i', aiff, '-ar', '16000', '-b:a', '64k', mp3], (err2) => {
        if (err2) { cleanup(); return resolve(null); }
        fs.readFile(mp3, (e3, buf) => {
          cleanup();
          resolve(e3 ? null : buf.toString('base64'));
        });
      });
    });
  });
}

// —— Edge-TTS：微软免费 TTS。韩文段用韩语音色、中文段用中文音色，拼接后返回 ——
let edgeTtsLib = null;
try { edgeTtsLib = require('msedge-tts'); } catch (e) { /* 未安装则跳过该层 */ }

const EDGE_VOICE_KO = process.env.EDGE_TTS_VOICE_KO || process.env.EDGE_TTS_VOICE || 'ko-KR-SunHiNeural'; // 韩语女声
const EDGE_VOICE_ZH = process.env.EDGE_TTS_VOICE_ZH || 'zh-CN-XiaoxiaoNeural';                            // 中文女声（晓晓）
const EDGE_RATE = process.env.EDGE_TTS_RATE || '-10%';                // 学习者友好：稍慢
const edgeClients = {}; // voice -> MsEdgeTTS 实例（每种音色一条长连接）

// 按文字语言切分：韩文段 / 中文段（拉丁字母、数字、标点跟随所在段）
function splitByLang(text) {
  const segs = [];
  let cur = '';
  let curLang = null;
  const classify = (ch) => {
    const c = ch.codePointAt(0);
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f)) return 'ko';
    if (c >= 0x4e00 && c <= 0x9fff) return 'zh';
    return null;
  };
  for (const ch of String(text)) {
    const lang = classify(ch);
    if (lang && curLang && lang !== curLang) {
      if (cur.trim()) segs.push({ lang: curLang, text: cur.trim() });
      cur = '';
      curLang = null;
    }
    if (lang) curLang = lang;
    cur += ch;
  }
  if (cur.trim()) segs.push({ lang: curLang || 'zh', text: cur.trim() });
  return segs.filter((s) => /[\uac00-\ud7a3\u4e00-\u9fff]/.test(s.text));
}

async function edgeTtsSeg(text, voice) {
  try {
    let c = edgeClients[voice];
    if (!c) {
      c = new edgeTtsLib.MsEdgeTTS();
      await c.setMetadata(voice, edgeTtsLib.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      edgeClients[voice] = c;
    }
    const { audioStream } = c.toStream(text, { rate: EDGE_RATE });
    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on('data', (chunk) => chunks.push(chunk));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });
    return Buffer.concat(chunks);
  } catch (e) {
    console.warn('[tts] Edge-TTS 段合成失败（' + voice + '）：', e.message);
    delete edgeClients[voice]; // 连接可能失效，下次重建
    return null;
  }
}

function ffmpegConcat(buffers) {
  return new Promise((resolve) => {
    if (!FFMPEG_BIN || FFMPEG_BIN === 'ffmpeg') return resolve(null);
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const dir = os.tmpdir();
    const listFile = dir + `/kfp_cat_${id}.txt`;
    const outFile = dir + `/kfp_cat_${id}.mp3`;
    const partFiles = [];
    const lines = buffers.map((b, i) => {
      const f = dir + `/kfp_cat_${id}_${i}.mp3`;
      fs.writeFileSync(f, b);
      partFiles.push(f);
      return `file '${f.replace(/'/g, "'\\''")}'`;
    });
    fs.writeFileSync(listFile, lines.join('\n'));
    execFile(FFMPEG_BIN, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFile], (err) => {
      partFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (e) {} });
      try { fs.unlinkSync(listFile); } catch (e) {}
      if (err) return resolve(null);
      fs.readFile(outFile, (e2, buf) => {
        try { fs.unlinkSync(outFile); } catch (e3) {}
        resolve(e2 ? null : buf);
      });
    });
  });
}

async function edgeSynthesize(text) {
  if (!edgeTtsLib) return null;
  const segs = splitByLang(text);
  if (!segs.length) return null;

  // 单一语言段：直接合成，无需拼接
  if (segs.length === 1) {
    const buf = await edgeTtsSeg(segs[0].text, segs[0].lang === 'ko' ? EDGE_VOICE_KO : EDGE_VOICE_ZH);
    return buf ? buf.toString('base64') : null;
  }

  // 多语言段：各段分别合成后拼接
  const buffers = [];
  for (const s of segs) {
    const buf = await edgeTtsSeg(s.text, s.lang === 'ko' ? EDGE_VOICE_KO : EDGE_VOICE_ZH);
    if (!buf) return null; // 任一段失败 → 交回调用方走下一级兜底
    buffers.push(buf);
  }
  if (buffers.length === 1) return buffers[0].toString('base64');
  const merged = await ffmpegConcat(buffers);
  return (merged || Buffer.concat(buffers)).toString('base64');
}

async function synthesize(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  // 1) Edge-TTS：免费、无 Key、跨平台（真机部署首选）
  const edge = await edgeSynthesize(t);
  if (edge) return edge;

  // 2) 云 TTS（配置了且不在冷却期才尝试）
  if (TTS.enabled && Date.now() > cloudTtsCooldownUntil) {
    try {
      const res = await client(TTS.baseURL, TTS.apiKey).audio.speech.create({
        model: TTS.model,
        voice: TTS.voice || undefined,
        input: t.slice(0, 500)
      });
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString('base64');
    } catch (e) {
      // 余额不足/限流：进入冷却期，改走本地合成
      cloudTtsCooldownUntil = Date.now() + 10 * 60 * 1000;
      console.warn('[tts] 云 TTS 失败，10 分钟内改用本地 say：', e.message);
    }
  }

  // 3) 本地兜底：macOS say（仅本机部署时可用；线上走 Edge-TTS/云 TTS）
  if (process.platform === 'darwin') {
    const b64 = await localSay(t);
    if (b64) return b64;
  }
  return null;
}

module.exports = { caps, chatText, chatJSON, chatStream, analyzeFrame, analyzeImage, transcribe, synthesize, extractJSON };
