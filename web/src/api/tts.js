import { post } from './client';

// 语音播报：文本 → 后端 /api/tts 合成 mp3(base64) → data URL → Audio 播放
// 交互规则与小程序一致：speak(text) 点一次播放；播放中再次调用同一段文本 = 停止
// 返回 Promise<true|false|'stopped'>
let current = null;      // Audio 单例
let currentUrl = '';     // 当前 blob/data URL（播完即释放）
let currentText = '';    // 当前正在播放的文本
let playSeq = 0;         // 合成请求序号：停止/切换后使在途请求失效

export function stopSpeak() {
  playSeq++;
  if (current) {
    try { current.pause(); } catch (e) { /* 已停止 */ }
    current = null;
  }
  if (currentUrl) {
    try { URL.revokeObjectURL(currentUrl); } catch (e) { /* 忽略 */ }
    currentUrl = '';
  }
  currentText = '';
}

function playBase64(b64, seq) {
  return new Promise((resolve) => {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      currentUrl = URL.createObjectURL(blob);
      const audio = new Audio(currentUrl);
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

  return post('/api/tts', { text: t }, 60000).then(
    (res) => {
      if (seq !== playSeq) return 'stopped'; // 期间已被停止/切换
      const b64 = res && res.audio_base64;
      if (!b64) return false;
      return playBase64(b64, seq).then((ok) => {
        if (!ok && seq === playSeq) currentText = '';
        return ok;
      });
    },
    () => {
      if (seq === playSeq) currentText = '';
      return false;
    }
  );
}
