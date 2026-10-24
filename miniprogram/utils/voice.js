// 语音播报：文本 → 后端 /api/tts 合成 mp3(base64) → 写本地文件播放
// 交互规则：speak(text) 点一次播放；播放中再次调用同一段文本 = 停止（播放/停止切换）
// 关键点：
// 1) 每次用独立文件名 —— 同路径覆盖会让播放器读缓存的旧音频
// 2) obeyMuteSwitch=false —— 避免 iOS 静音键导致手机上无声
// 返回 Promise<true|false>：true=开始播放，false=未播放（停止/失败/未配置）
const config = require('./config');

let current = null;      // InnerAudioContext 单例
let currentPath = '';    // 当前音频文件路径（播完即删）
let currentText = '';    // 当前正在播放的文本（用于「再点一次停止」判断）
let playSeq = 0;         // 合成请求序号：停止/切换后使在途请求失效
const AUDIO_CACHE_LIMIT = 4;
const audioCache = new Map(); // text -> Promise<base64|null>，缓存最近音频并合并相同在途请求

function requestAudio(text) {
  if (audioCache.has(text)) {
    const cached = audioCache.get(text);
    audioCache.delete(text);
    audioCache.set(text, cached);
    return cached;
  }

  const request = new Promise((resolve) => {
    wx.request({
      url: config.BASE_URL + '/api/tts',
      method: 'POST',
      data: { text },
      timeout: 60000,
      success: (res) => {
        const b64 = res.data && res.data.audio_base64;
        resolve(res.statusCode < 400 && b64 ? b64 : null);
      },
      fail: () => resolve(null)
    });
  });
  audioCache.set(text, request);
  while (audioCache.size > AUDIO_CACHE_LIMIT) {
    audioCache.delete(audioCache.keys().next().value);
  }
  request.then((audio) => {
    if (!audio && audioCache.get(text) === request) audioCache.delete(text);
  });
  return request;
}

// 助手回复到达后后台预合成；点击朗读时优先直接使用缓存。
function prepareSpeak(text) {
  const t = String(text || '').trim().slice(0, 400);
  if (!t) return Promise.resolve(false);
  return requestAudio(t).then((audio) => !!audio);
}

function stop() {
  playSeq++;
  if (current) {
    try { current.stop(); current.destroy(); } catch (e) { /* 已销毁 */ }
    current = null;
  }
  if (currentPath) {
    try { wx.getFileSystemManager().unlinkSync(currentPath); } catch (e) { /* 文件不存在 */ }
    currentPath = '';
  }
  currentText = '';
}

function playBase64(b64, seq) {
  return new Promise((resolve) => {
    try {
      const path = `${wx.env.USER_DATA_PATH}/kfp_tts_${seq}.mp3`;
      wx.getFileSystemManager().writeFileSync(path, b64, 'base64');
      currentPath = path;
      current = wx.createInnerAudioContext();
      current.src = path;
      current.obeyMuteSwitch = false; // 手机静音键不影响小程序朗读
      current.volume = 1;
      current.onEnded(() => { stop(); resolve(true); });
      current.onError(() => { stop(); resolve(false); });
      current.play();
    } catch (e) {
      console.warn('[tts] 播放失败', e);
      resolve(false);
    }
  });
}

function speak(text) {
  const t = String(text || '').trim().slice(0, 400);
  if (!t) return Promise.resolve(false);

  // 播放/停止切换：同一段文本播放中再次调用 → 结束（resolve 'stopped'，调用方可与失败区分）
  if (current && currentText === t) {
    stop();
    return Promise.resolve('stopped');
  }

  stop();
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

module.exports = { speak, stop, prepareSpeak };
