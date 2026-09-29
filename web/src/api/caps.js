// 后端能力探活（对应小程序 app.globalData.serverCaps）：/api/health 返回 { llm, asr, tts }
import { get } from './client';

let caps = { llm: false, asr: false, tts: false };
let fetched = false;

export async function loadCaps(force = false) {
  if (fetched && !force) return caps;
  try {
    const res = await get('/api/health', 10000);
    if (res) caps = res;
    fetched = true;
  } catch (e) { /* 后端未启动时保持默认 */ }
  return caps;
}

export function getCaps() {
  return caps;
}
