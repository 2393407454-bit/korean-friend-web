// 麦克风录音：Web Audio API 采集 PCM → 停止时降采样到 16kHz 单声道并编码 WAV
// 选 WAV 而非 MediaRecorder：各浏览器音频容器不一致（webm/mp4），后端 ASR 对 wav 兼容最稳
// 用法：
//   const rec = createRecorder();
//   await rec.start({ maxSeconds: 30, onTick(sec){} });
//   const { blob, duration } = await rec.stop();   // duration 秒
//   rec.cancel();                                  // 丢弃不产出

const TARGET_RATE = 16000;

export function createRecorder() {
  let stream = null;
  let ctx = null;
  let processor = null;
  let source = null;
  let analyser = null;
  let waveRaf = 0;
  let chunks = [];
  let startedAt = 0;
  let tickTimer = null;
  let running = false;

  async function start({ maxSeconds = 30, onTick, onLevel } = {}) {
    if (running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音');
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor 虽已废弃但全浏览器可用；教学场景音频量小，够用且免 Worklet 模块加载
    processor = ctx.createScriptProcessor(4096, 1, 1);
    chunks = [];
    processor.onaudioprocess = (e) => {
      if (!running) return;
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);

    running = true;
    startedAt = Date.now();

    // 实时波形：AnalyserNode 只读取电平，不接入输出，避免回声
    if (onLevel) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const paint = () => {
        if (!running) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = Math.abs(buf[i] - 128);
          if (v > peak) peak = v;
        }
        onLevel(Math.min(1, peak / 110));
        waveRaf = requestAnimationFrame(paint);
      };
      paint();
    }

    const tick = () => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      onTick && onTick(sec);
      if (sec >= maxSeconds) stop(); // 到上限自动结束（对齐小程序 duration: 30000）
    };
    tick();
    tickTimer = setInterval(tick, 1000);
  }

  function _cleanup() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (waveRaf) { cancelAnimationFrame(waveRaf); waveRaf = 0; }
    try { processor && processor.disconnect(); } catch (e) { /* 忽略 */ }
    try { analyser && analyser.disconnect(); } catch (e) { /* 忽略 */ }
    try { source && source.disconnect(); } catch (e) { /* 忽略 */ }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    try { ctx && ctx.close(); } catch (e) { /* 忽略 */ }
    stream = null; ctx = null; processor = null; source = null; analyser = null;
    running = false;
  }

  function durationSec() {
    return (Date.now() - startedAt) / 1000;
  }

  async function stop() {
    if (!running) return { blob: null, duration: 0 };
    const duration = durationSec();
    const captured = chunks;
    const sampleRate = ctx.sampleRate;
    _cleanup();

    // 合并 → 降采样 → WAV
    let total = 0;
    for (const c of captured) total += c.length;
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of captured) { merged.set(c, off); off += c.length; }
    const down = downsample(merged, sampleRate, TARGET_RATE);
    const blob = encodeWav(down, TARGET_RATE);
    return { blob, duration };
  }

  function cancel() {
    if (running) _cleanup();
    chunks = [];
  }

  return { start, stop, cancel, isRunning: () => running };
}

/* 线性插值降采样 */
function downsample(input, fromRate, toRate) {
  if (fromRate <= toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] || 0;
    const b = input[idx + 1] || a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/* 16-bit PCM WAV 封装 */
function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // 单声道
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // 字节率
  view.setUint16(32, 2, true);        // 块对齐
  view.setUint16(34, 16, true);       // 位深
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}
