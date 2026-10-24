import { post } from './client';

// 语音播报：文本 → 后端 /api/tts 合成 mp3(base64) → data URL → Audio 播放
// 交互规则与小程序一致：speak(text) 点一次播放；播放中再次调用同一段文本 = 停止
// 返回 Promise<true|false|'stopped'>
let current = null;      // Audio 单例
let currentText = '';    // 当前正在播放的文本
let playSeq = 0;         // 合成请求序号：停止/切换后使在途请求失效
const AUDIO_CACHE_LIMIT = 6;
const audioCache = new Map(); // text -> Promise<base64|null>，有界内存缓存并复用在途合成

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

// 助手回复展示后后台预合成；用户点击时优先复用已完成/进行中的请求。
export function prepareSpeak(text) {
  const t = String(text || '').trim().slice(0, 400);
  if (!t) return Promise.resolve(false);
  return requestAudio(t).then((audio) => !!audio);
}

export function stopSpeak() {
  playSeq++;
  if (current) {
    try { current.pause(); } catch (e) { /* 已停止 */ }
    current = null;
  }
  currentText = '';
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
  if (current && currentText === t) {
    stopSpeak();
    return Promise.resolve('stopped');
  }

  stopSpeak();
  currentText = t;
  const seq = playSeq;

  return requestAudio(t).then((b64) => {
    if (seq !== playSeq) return 'stopped'; // 期间已被停止/切换
    if (!b64) {
      currentText = '';
      return false;
    }
    return playBase64(b64, seq).then((ok) => {
      if (!ok && seq === playSeq) currentText = '';
      return ok;
    });
  });
}
