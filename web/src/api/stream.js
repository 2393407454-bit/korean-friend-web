import { getSession } from '../utils/storage';

const BASE = import.meta.env.VITE_API_BASE || '';

/**
 * 流式对话：fetch + ReadableStream 读 SSE（对应小程序 utils/stream.js）
 * 帧协议：data: {"t":"增量"} … data: {"done":true,...}；网络异常时降级非流式 /api/chat
 * 返回 { abort() }；onDelta/onDone/onError 与小程序端语义一致
 */
export function streamChat({ data, onDelta, onTool, onDone, onError }) {
  const ctrl = new AbortController();
  let finished = false;
  let errorNotified = false;
  let gotAnyFrame = false;

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
    } else if (obj.tool) {
      // Agent 工具调用事件（查资料中）：可选回调，不影响正文流
      onTool && onTool(obj.tool);
    } else if (obj.t) {
      gotAnyFrame = true;
      onDelta && onDelta(obj.t);
    }
  };

  // 降级：一次性非流式请求（后端 AI 排队/不支持流式时的兜底）
  const fallback = async () => {
    try {
      const d = await (await fetch(BASE + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (getSession().token || '')
        },
        body: JSON.stringify(data),
        signal: ctrl.signal
      })).json();
      if (d && d.error) return notifyError(d.error);
      finished = true;
      onDelta && onDelta(d.display || d.speech || '');
      onDone && onDone({
        done: true,
        display: d.display || '',
        speech: d.speech || '',
        sources: d.sources || [],
        tools_used: d.tools_used || [],
        errors: d.errors || [],
        mastered: d.mastered || [],
        korean_sentences: d.korean_sentences || [],
        profile: d.profile
      });
    } catch (e) {
      if (!ctrl.signal.aborted) notifyError('连不上后端（' + BASE + '）');
    }
  };

  (async () => {
    try {
      const res = await fetch(BASE + '/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (getSession().token || '')
        },
        body: JSON.stringify(data),
        signal: ctrl.signal
      });
      if (!res.ok || !res.body) {
        const d = res.headers.get('content-type') || '';
        if (d.includes('application/json')) {
          const j = await res.json().catch(() => null);
          if (j && j.error) return notifyError(j.error);
        }
        return notifyError('后端返回错误（' + res.status + '）');
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          raw.split('\n').forEach(handleFrame);
        }
      }
      if (!finished && !errorNotified) {
        if (gotAnyFrame) notifyError('连接中断');
        else await fallback();
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (!gotAnyFrame) return fallback();
      notifyError('连不上后端（' + BASE + '）');
    }
  })();

  return {
    abort() {
      ctrl.abort();
    }
  };
}
