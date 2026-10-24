// OpenAI 兼容的多模态客户端：LLM / 视觉（VLM）/ ASR / TTS
// 未配置对应 API Key 时自动进入 mock 模式，方便前端先跑通交互。
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
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
  model: process.env.LLM_MODEL || 'glm-4.7-flash'
};

// 联网搜索（智谱 GLM 内置 web_search 工具）：让模型先搜索核实再回复。
// LLM_WEB_SEARCH=true/false 强制开关；默认 auto = 仅在智谱 bigmodel 接口下自动开启。
const WEB_SEARCH = (() => {
  const v = String(process.env.LLM_WEB_SEARCH || 'auto').toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(v)) return true;
  if (['false', '0', 'off', 'no'].includes(v)) return false;
  return /bigmodel|zhipu/i.test(LLM.baseURL || '');
})();

function webSearchTool() {
  return [{ type: 'web_search', web_search: { enable: true, search_result: true } }];
}

// 联网分类只拦截需要时效/出处支持的问题。稳定语法和日常闲聊仍直接回答，
// 但娱乐动态、公开传闻、影视台词、网络词义和在韩实用信息不能只靠模型记忆。
const SEARCH_HINT =
  /(最近|最新|现在|目前|当下|今天|昨天|今年|明年|刚刚|本周|本月|近期|流行|热[门搜榜]|新闻|消息|新歌|回归|컴백|专辑|单曲|歌词|歌名|哪首歌|谁唱的|主题曲|ost|mv|榜单|排名|成员|组合成员|成员介绍|票价|价格|多少钱|费用|地址|在哪[里儿]|怎么去|营业时间|几点|开放|政策|签证|汇率|天气|上映|播出|开播|综艺|演唱会|见面会|巡演|官宣|机场路透|成员变动|恋爱传闻|恋情|绯闻|约会|分手|塌房|争议|道歉|八卦|传闻|热搜|名台词|经典台词|名场面|第几集|出处|原台词|流行语|网络用语|韩网梗|热梗|缩略语|俚语|新词|词源|房租|月租|押金|交通卡|地铁票|入境|医保|医疗|就医|银行开户|考试报名|topik.*(时间|报名)|搜一下|查一下|帮我查|网上)/i;

function userMessageText(messages) {
  const last = [...messages].reverse().find((m) => m && m.role === 'user');
  if (!last) return '';
  return typeof last.content === 'string'
    ? last.content
    : Array.isArray(last.content)
      ? last.content.map((c) => (c && c.text) || '').join(' ')
      : '';
}

function needsSearch(messages) {
  const text = userMessageText(messages);
  if (SEARCH_HINT.test(text)) return true;
  if (/(语法|助词|变形|时态|发音|怎么说|怎么读)/.test(text)) return false;
  return /[\uac00-\ud7a3ㄱ-ㅎㅏ-ㅣ]/.test(text) && /(词源|出处|梗|缩略语|流行语|网络用语|俚语|热梗|新词|什么意思|什么含义|怎么理解|怎么火)/.test(text);
}

function addSearchUnavailableContext(messages) {
  const notice = {
    role: 'system',
    content: '本轮联网搜索工具未能完成检索。不要声称已搜索、不要编造来源或当前事实；仍先回答可确认的常识/背景，清楚说明时效信息未能核实，并给用户一个具体的继续办法。'
  };
  return messages.length && messages[0].role === 'system'
    ? [messages[0], notice, ...messages.slice(1)]
    : [notice, ...messages];
}

function normalizeSearchSources(items) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const seen = new Set();
  return list.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const url = String(item.url || item.link || item.source_url || item.sourceUrl || '').trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return null;
    seen.add(url);
    const title = String(item.title || item.name || item.source || item.site_name || item.media || '').trim();
    const publishedAt = String(item.publish_time || item.published_at || item.publish_date || item.date || '').trim();
    return {
      title: (title || url).slice(0, 180),
      url: url.slice(0, 2048),
      published_at: publishedAt.slice(0, 80)
    };
  }).filter(Boolean).slice(0, 5);
}

function collectSearchResults(value, results, depth = 0) {
  if (!value || depth > 6) return;
  if (typeof value === 'string') {
    if (/^\s*[\[{]/.test(value)) {
      try { collectSearchResults(JSON.parse(value), results, depth + 1); } catch (e) { /* 非 JSON 工具文本 */ }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSearchResults(entry, results, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  if (value.search_result) collectSearchResults(value.search_result, results, depth + 1);
  if (value.url || value.link || value.source_url || value.sourceUrl) results.push(value);
  // 智谱在不同兼容接口中会把搜索结果放在 tool_calls 或 tool_calls_data 里。
  for (const key of ['tool_calls', 'tool_calls_data', 'function', 'event', 'choices', 'delta', 'message']) {
    if (value[key]) collectSearchResults(value[key], results, depth + 1);
  }
}

function searchSourcesFromMessage(message) {
  const results = [];
  collectSearchResults(message, results);
  return normalizeSearchSources(results);
}

function searchSourcesFromChunk(chunk) {
  const results = [];
  collectSearchResults(chunk, results);
  return normalizeSearchSources(results);
}

const VISION_MODEL = process.env.VISION_MODEL || 'glm-4.6v-flash';

// GLM-4.5/4.6/4.7 系列默认开启思考模式，对话场景关闭以保证响应速度
function noThinking(model) {
  return /glm-4\.[5-9]/i.test(model || '');
}
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
      '안녕하세요! 지금은 데모 모드예요. 你好！现在是演示模式。서버에 API 키를 설정하면 한국어 선생님이 대답할 거예요. 配置 API 密钥后，韩语老师就能正常回答了。',
    display:
      '⚠️ 演示模式：后端还没有配置 LLM_API_KEY。\n\n안녕하세요! 한국어로 함께 연습해요.\n你好！我们一起用韩语练习。\n\n复制 server/.env.example 为 .env，填入智谱 GLM 或其他 OpenAI 兼容服务的 Key 后重启即可。\n\n你刚才说的是：「' +
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

async function createWithRetry(body, maxTokens, { includeSearchSources = false, fullResponse = false } = {}) {
  body.max_tokens = maxTokens;
  let lastErr = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    await acquireSlot();
    try {
      const res = await client(LLM.baseURL, LLM.apiKey).chat.completions.create(body);
      if (fullResponse) return res;
      const message = res.choices && res.choices[0] && res.choices[0].message;
      const content = (message && message.content) || '';
      return includeSearchSources
        ? { content, sources: searchSourcesFromMessage(message) }
        : content;
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

async function chatText(messages, temperature, maxTokens, opts) {
  if (!LLM.apiKey) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const content = lastUser && typeof lastUser.content === 'string' ? lastUser.content : '';
    const mock = mockChat(content);
    return opts && opts.includeSearchSources ? { content: mock, sources: [] } : mock;
  }
  const body = {
    model: LLM.model,
    messages,
    temperature: temperature == null ? 0.7 : temperature
  };
  // GLM-4.5 及以上系列默认开启思考模式，对话场景关闭以保证响应速度
  if (noThinking(LLM.model)) body.thinking = { type: 'disabled' };
  // 对话主链路按需开启联网搜索：消息含时效/事实关键词才挂搜索工具
  const shouldSearch = WEB_SEARCH && opts && opts.search && needsSearch(messages);
  if (shouldSearch) body.tools = webSearchTool();
  try {
    return await createWithRetry(body, maxTokens || 1000, {
      includeSearchSources: !!(shouldSearch && opts && opts.includeSearchSources)
    });
  } catch (e) {
    if (!shouldSearch || (e && e.status) === 429) throw e;
    const fallbackBody = { ...body, messages: addSearchUnavailableContext(messages) };
    delete fallbackBody.tools;
    return createWithRetry(fallbackBody, maxTokens || 1000);
  }
}

// 当视觉模型只返回韩文原句时，用轻量文本模型补齐零基础学习字段。
// 这是异常兜底路径，正常情况下图片只走一次 VLM，不影响主要分析速度。
async function enrichSongLines(lines) {
  if (!LLM.apiKey || !Array.isArray(lines) || !lines.length) return null;
  const input = lines.slice(0, 16).map((line, index) => ({
    index,
    ko: String((line && line.ko) || '').trim().slice(0, 80)
  })).filter((line) => line.ko);
  if (!input.length) return null;
  const prompt =
    '你是给韩语零基础追星用户做歌词卡的老师。请把下面每句韩语补齐学习信息，只输出 JSON 数组，不要 Markdown。' +
    '每一项必须包含 index、ko、romanization、translation、grammar、vocab；禁止只返回 ko。' +
    'romanization 用小写英文并按音节用 - 分隔；translation 用自然简短中文；grammar 用中文解释一个最值得学的语法点，30 字以内；vocab 给 2~3 个核心单词，每个含 ko 和 zh。' +
    '即使句子很短，也要填写全部字段；ko 必须原样保留。\n' + JSON.stringify(input);
  try {
    const out = await chatText([{ role: 'user', content: prompt }], 0.2, 1800);
    const start = String(out || '').indexOf('[');
    const end = String(out || '').lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(String(out).slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.warn('[song] 学习字段补全失败：', e.message);
    return null;
  }
}

async function chatJSON(messages) {
  const result = await chatText(messages, 0.7, undefined, { search: true, includeSearchSources: true });
  const text = result && typeof result === 'object' ? result.content : result;
  const sources = result && typeof result === 'object' ? result.sources || [] : [];
  const parsed = extractJSON(text);
  if (parsed && (parsed.speech || parsed.display)) return { ...parsed, sources };
  // 模型没按协议输出时整体降级为纯文本回复
  return { speech: text.slice(0, 300), display: text, state_patch: {}, ui_hints: {}, sources };
}

/* =========================================================
   Function Calling 工具循环（Agent 模式）
   把知识库检索 / 曲库 / 生词本暴露成 function tools，由模型自主决定
   调用与参数；工具结果回填后继续生成。模型或网关不支持 tools 时
   自动降级为无工具调用，线上行为永远有兜底。
   ========================================================= */
const TOOLS_ON = !['false', '0', 'off', 'no'].includes(String(process.env.AI_TOOLS || 'true').toLowerCase());
const MAX_TOOL_ROUNDS = 3;

function getFunctionTools() {
  // 延迟加载避免与 tools.js 互相 require 成环（tools.js → knowledge.js → llm.js）
  return require('./tools').getFunctionDefs();
}

// embedding 客户端：RAG 语料索引与查询向量统一走这里
async function embedTexts(texts, model, dimensions) {
  if (!LLM.apiKey) throw new Error('未配置 LLM_API_KEY，无法生成向量');
  const res = await client(LLM.baseURL, LLM.apiKey).embeddings.create({
    model: model || 'embedding-3',
    input: texts,
    ...(dimensions ? { dimensions } : {})
  });
  const vectors = ((res && res.data) || []).map((d) => d && d.embedding);
  if (vectors.length !== texts.length || !vectors.every(Array.isArray)) {
    throw new Error('向量返回结构异常');
  }
  return vectors;
}

async function chatJSONWithTools(messages, ctx, { onToolEvent } = {}) {
  if (!LLM.apiKey || !TOOLS_ON) {
    const base = await chatJSON(messages);
    return base;
  }
  const funcTools = getFunctionTools();
  const shouldSearch = WEB_SEARCH && needsSearch(messages);
  const chatMessages = messages.slice();
  let toolsDropped = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const includeTools = !toolsDropped && round < MAX_TOOL_ROUNDS;
    const body = {
      model: LLM.model,
      messages: chatMessages,
      temperature: 0.7
    };
    if (noThinking(LLM.model)) body.thinking = { type: 'disabled' };
    if (includeTools) {
      body.tools = shouldSearch ? funcTools.concat(webSearchTool()) : funcTools;
      body.tool_choice = 'auto';
    }

    let res;
    try {
      res = await createWithRetry(body, 1100, { fullResponse: true });
    } catch (e) {
      // tools 不被支持（400/404/422 等）→ 摘掉工具整体重试；429 属限流直接上抛
      if (!includeTools || (e && e.status) === 429) throw e;
      toolsDropped = true;
      continue;
    }

    const message = res.choices && res.choices[0] && res.choices[0].message;
    const toolCalls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (toolCalls.length && includeTools) {
      chatMessages.push({ role: 'assistant', content: message.content || '', tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const out = await require('./tools').executeCall(tc, ctx || {});
        if (onToolEvent) {
          try { onToolEvent({ name: out.name, label: out.label, ok: out.ok }); } catch (e) { /* 回调异常不中断 */ }
        }
        chatMessages.push({ role: 'tool', tool_call_id: tc.id, content: out.result });
      }
      continue;
    }

    const text = (message && message.content) || '';
    const sources = searchSourcesFromMessage(message);
    const parsed = extractJSON(text);
    if (parsed && (parsed.speech || parsed.display)) return { ...parsed, sources };
    return { speech: text.slice(0, 300), display: text, state_patch: {}, ui_hints: {}, sources };
  }

  // 工具轮次用尽仍没拿到正式回复：摘掉 tools 直接要最终答案
  return chatJSON(messages);
}

// 流式对话：逐增量回调 onDelta，返回完整文本。
// 首块未产出前的 429/5xx 会自动重试；已开始输出后的失败直接抛出（前端保留已收文本）。
// Agent 模式：传入 tools（function tools）后进入工具循环——模型先调工具拿资料，
// 有内容增量才开始向 onDelta 转发；工具轮次有上限，异常时摘掉工具兜底。
async function chatStream(messages, { temperature, maxTokens, onDelta, onSources, tools, ctx, onToolEvent } = {}) {
  if (!LLM.apiKey) {
    const mock = mockChat((messages.find((m) => m.role === 'user') || {}).content || '');
    const parsed = extractJSON(mock);
    const text = (parsed && parsed.display) || mock;
    if (onDelta) onDelta(text);
    return text;
  }
  const funcTools = TOOLS_ON && tools && tools.length ? tools : null;
  const shouldSearch = WEB_SEARCH && needsSearch(messages);
  let searchFallbackUsed = false;
  let toolsDropped = false;
  let toolRounds = 0;
  const chatMessages = messages.slice();

  const buildBody = () => {
    const includeTools = funcTools && !toolsDropped && !searchFallbackUsed && toolRounds < MAX_TOOL_ROUNDS;
    const body = {
      model: LLM.model,
      messages: searchFallbackUsed ? addSearchUnavailableContext(chatMessages) : chatMessages,
      stream: true,
      temperature: temperature == null ? 0.7 : temperature,
      max_tokens: maxTokens || 800 // 不设会导致回复长度不受控、流式时间被拉长
    };
    if (noThinking(LLM.model)) body.thinking = { type: 'disabled' };
    // 对话主链路按需开启联网搜索：消息含时效/事实关键词才挂搜索工具
    if (includeTools || (shouldSearch && !searchFallbackUsed)) {
      body.tools = [];
      if (includeTools) body.tools = body.tools.concat(funcTools);
      if (shouldSearch && !searchFallbackUsed) body.tools = body.tools.concat(webSearchTool());
      body.tool_choice = 'auto';
    }
    return body;
  };

  const foundSources = new Map();

  let lastErr = null;
  let attempt = 0;
  while (attempt <= 2) {
    await acquireSlot();
    let emitted = false;
    let full = '';
    const toolCallsAcc = new Map(); // index -> {id, name, arguments}
    try {
      const stream = await client(LLM.baseURL, LLM.apiKey).chat.completions.create(buildBody());
      for await (const chunk of stream) {
        for (const source of searchSourcesFromChunk(chunk)) foundSources.set(source.url, source);
        const choice = chunk.choices && chunk.choices[0];
        const delta = (choice && choice.delta) || {};
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const slot = toolCallsAcc.get(tc.index) || { id: '', name: '', arguments: '' };
            if (tc.id) slot.id = tc.id;
            if (tc.function && tc.function.name) slot.name = tc.function.name;
            if (tc.function && tc.function.arguments) slot.arguments += tc.function.arguments;
            toolCallsAcc.set(tc.index, slot);
          }
        }
        const deltaText = delta.content || '';
        if (deltaText) {
          emitted = true;
          full += deltaText;
          if (onDelta) {
            try { onDelta(deltaText); } catch (e) { /* 回调异常不中断流 */ }
          }
        }
      }
      // 本轮只产出了工具调用（还没有正文）→ 执行工具、回填结果、继续下一轮
      const wantsTools = toolCallsAcc.size && !emitted && funcTools && !toolsDropped;
      if (wantsTools && toolRounds < MAX_TOOL_ROUNDS) {
        toolRounds++;
        const assembled = [...toolCallsAcc.values()].map((tc) => ({
          id: tc.id || ('call_' + toolRounds + '_' + crypto.randomUUID().slice(0, 8)),
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments || '{}' }
        }));
        chatMessages.push({ role: 'assistant', content: '', tool_calls: assembled });
        for (const tc of assembled) {
          const out = await require('./tools').executeCall(tc, ctx || {});
          if (onToolEvent) {
            try { onToolEvent({ name: out.name, label: out.label, ok: out.ok }); } catch (e) { /* 忽略 */ }
          }
          chatMessages.push({ role: 'tool', tool_call_id: tc.id, content: out.result });
        }
        continue; // 不消耗 attempt：工具轮是正常推进
      }
      if (wantsTools) {
        toolsDropped = true; // 工具轮次用尽仍不给正文：摘掉工具强制要最终回答
        continue;
      }
      if (onSources) onSources([...foundSources.values()].slice(0, 5));
      return full;
    } catch (e) {
      lastErr = e;
      const st = (e && e.status) || 0;
      const retryable = st === 429 || st === 500 || st === 502 || st === 503;
      if (funcTools && !toolsDropped && !emitted && st !== 429 && [400, 404, 422].includes(st)) {
        toolsDropped = true; // function calling 不被支持：摘掉工具重试
        continue;
      }
      if (shouldSearch && !searchFallbackUsed && !emitted && st !== 429) {
        searchFallbackUsed = true;
        foundSources.clear();
        continue;
      }
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
    attempt++;
  }
  if (lastErr && lastErr.status === 429) {
    const err = new Error('AI 老师有点忙（免费额度限流），请等 10 秒再发送');
    err.status = 429;
    throw err;
  }
  throw lastErr || new Error('LLM 流式调用失败');
}

async function visionCall(content, maxTokens) {
  const body = { model: VISION_MODEL, messages: [{ role: 'user', content }] };
  if (noThinking(VISION_MODEL)) body.thinking = { type: 'disabled' };
  return createWithRetry(body, maxTokens || 700);
}

// 视觉：一次调用直接返回 K-pop 学歌所需的结构化 JSON，避免「先 OCR、再 LLM」两次排队。
async function analyzeSongImage(base64, maxLines) {
  if (!LLM.apiKey) return '';
  const lineLimit = maxLines || 24;
  return visionCall([
    {
      type: 'text',
      text:
        '你是韩语歌词学习教练。请严格只读取图片中清晰可见的文字，并只输出一个 JSON 对象，不要 Markdown 或其他说明。' +
        'JSON 格式：{"summary":"只概括图片中可见内容","candidates":[{"title":"图片中出现的歌名","artist":"图片中出现的歌手","confidence":1}],"lines":[{"ko":"图片中可见的韩语原句","romanization":"小写连字符罗马音","translation":"中文翻译","grammar":"一句话语法点","vocab":[{"ko":"图片中句子里的单词","zh":"释义"}]}]}。' +
        '规则：只分析图片中实际出现的内容，不要根据歌名、歌手、零散歌词或常识猜测歌曲，也不要补写图片外的歌词；图片没有出现歌名/歌手时 candidates 必须为空数组；不要把图片外的副歌或下一句加入 lines；按图片从上到下输出最多 ' + lineLimit + ' 句。' +
        '每句必须填写 romanization、translation、grammar、vocab；vocab 只能选自该句，语法只解释该句；summary 只总结图片中实际出现的内容；看不清的字不要猜，直接跳过该句。'
    },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }
  ], 1200);
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
const edgeClients = {}; // voice -> { client, lastUsed }（复用长连接降低延迟，闲置自动重建）
const EDGE_IDLE_MS = 30 * 1000;    // 空闲超过该时长直接重建：切网/热点 NAT 会掐掉闲置的 WebSocket
const EDGE_TIMEOUT_MS = 20 * 1000; // 单段合成超时，防止半开连接把请求拖死

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

async function newEdgeClient(voice) {
  const c = new edgeTtsLib.MsEdgeTTS();
  const p = c.setMetadata(voice, edgeTtsLib.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  p.catch(() => {}); // 超时分支胜出后，迟到的 rejection 不能变成 unhandledRejection
  await Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), EDGE_TIMEOUT_MS))
  ]);
  return c;
}

async function edgeTtsSeg(text, voice) {
  let lastErr = null;
  // 失败自动重试一次：第一次多半死在已被网络掐掉的旧长连接上，重建后即可恢复
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let entry = edgeClients[voice];
      if (!entry || Date.now() - entry.lastUsed > EDGE_IDLE_MS) {
        entry = { client: await newEdgeClient(voice), lastUsed: Date.now() };
        edgeClients[voice] = entry;
      }
      entry.lastUsed = Date.now();
      const { audioStream } = entry.client.toStream(text, { rate: EDGE_RATE });
      const chunks = [];
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('合成超时')), EDGE_TIMEOUT_MS);
        audioStream.on('data', (chunk) => chunks.push(chunk));
        audioStream.on('end', () => { clearTimeout(timer); resolve(); });
        audioStream.on('error', (e) => { clearTimeout(timer); reject(e); });
      });
      return Buffer.concat(chunks);
    } catch (e) {
      lastErr = e;
      delete edgeClients[voice]; // 连接已不可信，下一轮重建
    }
  }
  console.warn('[tts] Edge-TTS 段合成失败（' + voice + '）：', lastErr && lastErr.message);
  return null;
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

  // 多语言段按原顺序拼接；韩语与中文各自串行复用连接、两种音色并行合成。
  // 原来所有小段逐段 await，混合语言回答每次切换语言都额外等待一次网络往返。
  const lanes = { ko: Promise.resolve(), zh: Promise.resolve() };
  const jobs = segs.map((s) => {
    const voice = s.lang === 'ko' ? EDGE_VOICE_KO : EDGE_VOICE_ZH;
    const job = lanes[s.lang].then(() => edgeTtsSeg(s.text, voice));
    lanes[s.lang] = job.then(() => undefined, () => undefined);
    return job;
  });
  const buffers = await Promise.all(jobs);
  if (buffers.some((buf) => !buf)) return null; // 任一段失败 → 交回调用方走下一级兜底
  if (buffers.length === 1) return buffers[0].toString('base64');
  const merged = await ffmpegConcat(buffers);
  return (merged || Buffer.concat(buffers)).toString('base64');
}

const TTS_CACHE_LIMIT = 32;
const TTS_CACHE_TTL_MS = 10 * 60 * 1000;
const ttsCache = new Map(); // key -> { audio, at }; bounded process-local LRU
const ttsInFlight = new Map(); // key -> Promise<string|null>; coalesce duplicate requests

function cacheTts(key, audio) {
  ttsCache.delete(key);
  ttsCache.set(key, { audio, at: Date.now() });
  while (ttsCache.size > TTS_CACHE_LIMIT) ttsCache.delete(ttsCache.keys().next().value);
}

async function synthesizeUncached(text) {
  // 1) Edge-TTS：免费、无 Key、跨平台（真机部署首选）
  const edge = await edgeSynthesize(text);
  if (edge) return edge;

  // 2) 云 TTS（配置了且不在冷却期才尝试）
  if (TTS.enabled && Date.now() > cloudTtsCooldownUntil) {
    try {
      const res = await client(TTS.baseURL, TTS.apiKey).audio.speech.create({
        model: TTS.model,
        voice: TTS.voice || undefined,
        input: text.slice(0, 500)
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
    const b64 = await localSay(text);
    if (b64) return b64;
  }
  return null;
}

async function synthesize(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  // Use a digest as the map key so the in-memory cache does not keep a second copy of spoken text.
  const key = crypto.createHash('sha256')
    .update(`${EDGE_VOICE_KO}|${EDGE_VOICE_ZH}|${EDGE_RATE}|${TTS.model}|${TTS.voice}|${t}`)
    .digest('hex');
  const cached = ttsCache.get(key);
  if (cached && Date.now() - cached.at < TTS_CACHE_TTL_MS) {
    ttsCache.delete(key);
    ttsCache.set(key, { ...cached, at: Date.now() });
    return cached.audio;
  }
  if (cached) ttsCache.delete(key);
  if (ttsInFlight.has(key)) return ttsInFlight.get(key);

  const request = synthesizeUncached(t)
    .then((audio) => {
      if (audio) cacheTts(key, audio);
      return audio;
    })
    .finally(() => ttsInFlight.delete(key));
  ttsInFlight.set(key, request);
  return request;
}

module.exports = { caps, chatText, enrichSongLines, chatJSON, chatJSONWithTools, embedTexts, chatStream, analyzeFrame, analyzeImage, analyzeSongImage, transcribe, synthesize, extractJSON, needsSearch };
