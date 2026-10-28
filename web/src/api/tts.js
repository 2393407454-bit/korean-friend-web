import { post } from './client';

// 语音播报（两级引擎，按延迟优先排序）：
// 1) 浏览器本地 Web Speech API（首选）：点击即出声，零网络往返（实测服务端 Edge-TTS
//    双语 4.2s / 短句 1.5s，本地 <0.1s）。韩语用系统 Yuna / Google 한국어，
//    中文用 Tingting / Google 普通话；只接受高质量音色，只有系统玩具音色时不用。
// 2) 服务端 Edge-TTS（兜底）：本地无合适语音时走 /api/tts（原链路，带缓存）。
// 交互规则与小程序一致：speak(text) 点一次播放；播放中再次调用同一段文本 = 停止
// 返回 Promise<true|false|'stopped'>：true=完整播完，false=不可用，'stopped'=被停止
let current = null;      // Audio 单例（服务端兜底链路）
let currentText = '';    // 当前正在播放的文本（两种引擎共用，保证切换语义一致）
let playSeq = 0;         // 播放序号：停止/切换后使在途合成与本地播放失效
const AUDIO_CACHE_LIMIT = 6;
const audioCache = new Map(); // text -> Promise<base64|null>，有界内存缓存并复用在途合成

/* ---------------- 语言切分（与 server/src/llm.js splitByLang 同规则） ---------------- */
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

/* ---------------- 本地语音选择 ---------------- */
const LOCAL_MIN_SCORE = 80; // 低于该分数视为玩具音色，宁可用服务端也不用
const NOVELTY_RE = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Jester|Bahh|Albert|Bad News|Bells|Boing|Bubbles|Cellos|Good News|Jingles|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Ralph|Junior|Kathy)\b/i;

function scoreVoice(v, langPrefix) {
  const lang = String(v.lang || '').toLowerCase();
  if (!lang.startsWith(langPrefix)) return -1;
  const name = String(v.name || '');
  let s;
  if (langPrefix === 'ko') {
    s = /yuna/i.test(name) ? 100 : /google/i.test(name) ? 90 : /microsoft/i.test(name) ? 80 : 10;
  } else {
    s = /tingting|ting-ting|tian-?tian|meijia|sinji/i.test(name) ? 100 : /google/i.test(name) ? 90 : /microsoft/i.test(name) ? 80 : 10;
    if (/^zh-cn/i.test(lang)) s += 5;
  }
  if (NOVELTY_RE.test(name)) s = Math.min(s, 5);
  return s;
}

let voicesCache = null; // null=尚未就绪
let voicesReadyPromise = null;

function loadVoices() {
  if (!('speechSynthesis' in window)) return [];
  const list = window.speechSynthesis.getVoices();
  if (list.length) voicesCache = list;
  return list;
}

// 首次调用即预热：voices 常异步加载，模块加载时就开始等，点击时通常已就绪
function ensureVoices(maxWaitMs) {
  if (voicesCache && voicesCache.length) return Promise.resolve(voicesCache);
  if (voicesReadyPromise) return voicesReadyPromise;
  loadVoices();
  if (voicesCache && voicesCache.length) return Promise.resolve(voicesCache);
  voicesReadyPromise = new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { window.speechSynthesis.onvoiceschanged = null; } catch (e) { /* 忽略 */ }
      voicesReadyPromise = null;
      resolve(voicesCache || []);
    };
    try {
      window.speechSynthesis.onvoiceschanged = () => { loadVoices(); if (voicesCache && voicesCache.length) finish(); };
    } catch (e) { /* 老浏览器无此事件 */ }
    setTimeout(finish, maxWaitMs);
  });
  return voicesReadyPromise;
}
ensureVoices(1500);

function pickVoice(langPrefix) {
  const list = voicesCache || [];
  let best = null, bestScore = -1;
  for (const v of list) {
    const s = scoreVoice(v, langPrefix);
    if (s > bestScore) { best = v; bestScore = s; }
  }
  return bestScore >= LOCAL_MIN_SCORE ? best : null;
}

/* ---------------- 本地播放（Web Speech） ---------------- */
// 返回 true=完整播完，false=本地不可用（交服务端兜底），'stopped'=被打断
function speakLocal(text, seq) {
  return ensureVoices(900).then(() => {
    if (!('speechSynthesis' in window)) return false;
    const segs = splitByLang(text);
    if (!segs.length) return false;
    const utterances = [];
    for (const seg of segs) {
      const voice = pickVoice(seg.lang);
      if (!voice) return false; // 任一语言没有高质量本地音色 → 整段走服务端，保证风格统一
      const u = new SpeechSynthesisUtterance(seg.text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = seg.lang === 'ko' ? 0.92 : 0.95; // 学习者友好的稍慢语速（对齐服务端 -10%）
      utterances.push(u);
    }
    if (!utterances.length) return false;

    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(playSeq === seq ? value : 'stopped');
      };
      let startedAny = false;
      utterances.forEach((u, i) => {
        u.onstart = () => { startedAny = true; };
        u.onerror = () => {
          // cancel() 触发的 interrupted = 用户主动停止；其余错误交服务端兜底
          if (playSeq !== seq) return finish('stopped');
          if (!startedAny) finish(false);
          else finish(true); // 播到一半才出错：按已播处理，避免服务端兜底造成重播
        };
        u.onend = () => {
          if (i === utterances.length - 1) finish(true);
        };
      });
      try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
      for (const u of utterances) window.speechSynthesis.speak(u);
      // 看门狗：点击后 2.5s 仍没出声（自动播放策略拦截等）→ 取消排队语音后交服务端兜底，
      // 防止兜底音频播放中途本地语音才姗姗启动，造成双声道重叠
      setTimeout(() => {
        if (!startedAny && !done && playSeq === seq) {
          try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
          finish(false);
        }
      }, 2500);
    });
  });
}

/* ---------------- 服务端兜底（Edge-TTS，原链路） ---------------- */
function requestAudio(text) {
  if (audioCache.has(text)) {
    const cached = audioCache.get(text);
    audioCache.delete(text);
    audioCache.set(text, cached);
    return cached;
  }

  const request = post('/api/tts', { text }, 60000)
    .then((res) => (res && res.audio_base64) || null)
    .catch(() => null);
  audioCache.set(text, request);
  while (audioCache.size > AUDIO_CACHE_LIMIT) {
    audioCache.delete(audioCache.keys().next().value);
  }
  request.then((audio) => {
    if (!audio && audioCache.get(text) === request) audioCache.delete(text);
  });
  return request;
}

// 助手回复展示后后台预合成服务端音频（本地语音可用时不会用到，保留给预热场景）
export function prepareSpeak(text) {
  const t = String(text || '').trim().slice(0, 400);
  if (!t) return Promise.resolve(false);
  return requestAudio(t).then((audio) => !!audio);
}

export function stopSpeak() {
  playSeq++;
  currentText = '';
  if (current) {
    try { current.pause(); } catch (e) { /* 已停止 */ }
    current = null;
  }
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
  }
}

function playBase64(b64, seq) {
  return new Promise((resolve) => {
    try {
      // 让浏览器原生解码 Base64 音频，避免先在 JS 主线程逐字节解码再复制成 Blob。
      const audio = new Audio('data:audio/mpeg;base64,' + b64);
      current = audio;
      audio.onended = () => { stopSpeak(); resolve(true); };
      audio.onerror = () => { stopSpeak(); resolve(false); };
      audio.play().catch(() => { stopSpeak(); resolve(false); });
    } catch (e) {
      console.warn('[tts] 播放失败', e);
      resolve(false);
    }
  });
}

export function speak(text) {
  const t = String(text || '').trim().slice(0, 400);
  if (!t) return Promise.resolve(false);

  // 播放/停止切换：同一段文本播放中再次调用 → 结束
  if (currentText && currentText === t && (('speechSynthesis' in window && window.speechSynthesis.speaking) || current)) {
    stopSpeak();
    return Promise.resolve('stopped');
  }

  stopSpeak();
  currentText = t;
  const seq = playSeq;

  return speakLocal(t, seq).then((localResult) => {
    if (localResult === 'stopped') return 'stopped';
    if (localResult === true) return true;
    if (playSeq !== seq) return 'stopped'; // 本地探测期间被停止/切换
    // 服务端兜底：合成整段 mp3 → base64 → Audio 播放（本地无合适音色时）
    return requestAudio(t).then((b64) => {
      if (playSeq !== seq) return 'stopped';
      if (!b64) {
        currentText = '';
        return false;
      }
      return playBase64(b64, seq).then((ok) => {
        if (!ok && playSeq === seq) currentText = '';
        return ok;
      });
    });
  });
}
