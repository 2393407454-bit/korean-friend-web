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
      finished = true;
      onError && onError(new Error(obj.error));
    } else if (obj.t) {
      onDelta && onDelta(obj.t);
    }
  };

  const task = wx.request({
    url: config.BASE_URL + '/api/chat/stream',
    method: 'POST',
    data,
    enableChunked: true,
    timeout: 180000,
    success: () => {
      if (!finished) onError && onError(new Error('连接中断'));
    },
    fail: (e) => {
      if (!finished) onError && onError(new Error('连不上后端（' + config.BASE_URL + '）'));
    }
  });

  if (task && task.onChunkReceived) {
    task.onChunkReceived((res) => {
      buf += decodeChunk(res.data);
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        raw.split('\n').forEach(handleFrame);
      }
    });
  } else {
    // 基础库不支持分块时降级：普通请求走非流式接口
    wx.request({
      url: config.BASE_URL + '/api/chat',
      method: 'POST',
      data,
      timeout: 120000,
      success: (res) => {
        const d = res.data || {};
        finished = true;
        onDelta && onDelta(d.display || d.speech || '');
        onDone && onDone({ done: true, speech: d.speech || '', korean_sentences: [], profile: d.profile });
      },
      fail: () => onError && onError(new Error('连不上后端'))
    });
  }

  return task;
}

module.exports = { streamChat };
