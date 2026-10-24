// 流式对话客户端：SSE 分块接收（后端已把非 ASCII 转义成 \uXXXX，纯 ASCII 帧无截断风险）
const config = require('./config');

function decodeChunk(buf) {
  // wx onChunkReceived 给的是 ArrayBuffer；后端 payload 已是纯 ASCII，直接按字节转字符串即可
  const arr = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return s;
}

/**
 * streamChat({ data, onDelta, onDone, onError })
 * data: { userId, text, channel, mode, characterId }
 * 返回 requestTask（可 abort）
 */
function streamChat({ data, onDelta, onDone, onError }) {
  let buf = '';
  let finished = false;
  let usingFallback = false;
  let errorNotified = false;

  const notifyError = (message) => {
    if (finished || errorNotified) return;
    errorNotified = true;
    onError && onError(new Error(message));
  };

  const handleFrame = (line) => {
    if (!line.startsWith('data: ')) return;
    let obj;
    try {
      obj = JSON.parse(line.slice(6));
    } catch (e) {
      return;
    }
    if (obj.done) {
      finished = true;
      onDone && onDone(obj);
    } else if (obj.error) {
      notifyError(obj.error);
      finished = true;
    } else if (obj.t) {
      onDelta && onDelta(obj.t);
    }
  };

  const fallback = () => {
    usingFallback = true;
    return wx.request({
      url: config.BASE_URL + '/api/chat',
      method: 'POST',
      data,
      timeout: 120000,
      success: (res) => {
        if (res.statusCode >= 400) return notifyError('后端返回错误（' + res.statusCode + '）');
        const d = res.data || {};
        finished = true;
        onDelta && onDelta(d.display || d.speech || '');
        onDone && onDone({
          done: true,
          display: d.display || '',
          speech: d.speech || '',
          sources: d.sources || [],
          errors: d.errors || [],
          mastered: d.mastered || [],
          korean_sentences: d.korean_sentences || [],
          profile: d.profile
        });
      },
      fail: () => notifyError('连不上后端（' + config.BASE_URL + '）')
    });
  };

  // 先判断能力，再决定请求类型，避免不支持分块时同时发起两次 AI 请求。
  let canChunk = false;
  try {
    canChunk = typeof wx.canIUse === 'function' && wx.canIUse('request.onChunkReceived');
  } catch (e) {
    canChunk = false;
  }
  if (!canChunk) return fallback();

  const task = wx.request({
    url: config.BASE_URL + '/api/chat/stream',
    method: 'POST',
    data,
    enableChunked: true,
    timeout: 180000,
    success: (res) => {
      if (res.statusCode >= 400) return notifyError('后端返回错误（' + res.statusCode + '）');
      if (!finished && !usingFallback) notifyError('连接中断');
    },
    fail: () => {
      if (!finished && !usingFallback) notifyError('连不上后端（' + config.BASE_URL + '）');
    }
  });

  if (!task || typeof task.onChunkReceived !== 'function') {
    // 极少数基础库声明支持但实例没有回调能力：终止这次请求后再单独降级。
    usingFallback = true;
    if (task && typeof task.abort === 'function') task.abort();
    return fallback();
  }

  task.onChunkReceived((res) => {
    buf += decodeChunk(res.data);
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      raw.split('\n').forEach(handleFrame);
    }
  });

  return task;
}

module.exports = { streamChat };
