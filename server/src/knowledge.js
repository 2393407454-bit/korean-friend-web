// RAG 检索模块：知识库语料（data/knowledge.js）的向量/关键词混合检索。
// 设计原则：
// 1) 向量优先：语料一次性 embedding 成本地索引（data/knowledge_index.json），查询时只嵌一次问题；
// 2) 关键词降级：未配 Key、余额不足、索引缺失时自动退回 CJK 二元组+词元覆盖打分，检索能力永不离线；
// 3) 索引自愈：语料哈希变化时标记过期，后台重建，重建完成前继续用旧索引或关键词模式。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CORPUS } = require('./data/knowledge');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INDEX_FILE = path.join(DATA_DIR, 'knowledge_index.json');
const EMBED_MODEL = process.env.EMBED_MODEL || 'embedding-3';
const EMBED_DIM = Number(process.env.EMBED_DIM) || 512;
const VECTOR_SEARCH_MIN_SCORE = 0.35; // 向量召回阈值：低于该分数的结果不注入
const KEYWORD_SEARCH_MIN_SCORE = 0.06;

let corpusHash = crypto.createHash('sha256')
  .update(JSON.stringify(CORPUS))
  .digest('hex')
  .slice(0, 16);

let index = null;         // { model, dim, hash, built_at, items: [{id, vector}] }
let indexStale = false;   // 语料已更新但新索引尚未建成
let buildingPromise = null;

function corpusById() {
  if (!knowledge._byId) knowledge._byId = new Map(CORPUS.map((c) => [c.id, c]));
  return knowledge._byId;
}

/* ============ 向量化：复用 llm.js 的 OpenAI 兼容客户端 ============ */
let llmMod = null;
function llm() {
  if (!llmMod) llmMod = require('./llm');
  return llmMod;
}

// 查询向量 LRU 缓存：同一轮多工具调用、同主题追问不重复计费
const queryCache = new Map();
const QUERY_CACHE_LIMIT = 64;

function cacheGet(key) {
  const hit = queryCache.get(key);
  if (!hit) return null;
  queryCache.delete(key);
  queryCache.set(key, hit); // touch LRU 顺序
  return hit.vector;
}

async function embedTexts(texts) {
  return llm().embedTexts(texts, EMBED_MODEL, EMBED_DIM);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ============ 索引构建与加载 ============ */
function corpusDir() {
  return DATA_DIR;
}

async function buildIndex() {
  if (!CORPUS.length) return null;
  // 智谱 embedding 单次 input 上限 64 条，分批嵌入后按原顺序合并
  const texts = CORPUS.map((c) => c.title + '\n' + c.text);
  const vectors = [];
  const BATCH = 32;
  for (let i = 0; i < texts.length; i += BATCH) {
    const part = await embedTexts(texts.slice(i, i + BATCH));
    vectors.push(...part);
  }
  const items = vectors.map((v, i) => ({ id: CORPUS[i].id, vector: v }));
  const idx = {
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    hash: corpusHash,
    built_at: new Date().toISOString(),
    items
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = INDEX_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(idx));
  fs.renameSync(tmp, INDEX_FILE);
  index = idx;
  indexStale = false;
  return idx;
}

function loadIndex() {
  if (index) return index;
  try {
    const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    if (idx && idx.hash === corpusHash && Array.isArray(idx.items) && idx.items.length === CORPUS.length) {
      index = idx;
      indexStale = false;
    } else {
      indexStale = true; // 语料已改：旧索引暂时可用但需重建
      index = idx.items && idx.items.length === CORPUS.length ? idx : null;
    }
  } catch (e) {
    index = null;
  }
  return index;
}

// 后台重建索引（服务启动时若语料哈希变化或无索引则调用）；并发调用合并为一次
function ensureIndexAsync() {
  if (buildingPromise) return buildingPromise;
  if (!process.env.LLM_API_KEY) return Promise.resolve(null);
  buildingPromise = buildIndex()
    .then((idx) => {
      console.log('[rag] 知识库向量索引已就绪：' + (idx ? idx.items.length : 0) + ' 条（' + EMBED_MODEL + ' ' + EMBED_DIM + '维）');
      return idx;
    })
    .catch((e) => {
      console.warn('[rag] 向量索引构建失败，检索退回关键词模式：', e.message);
      return null;
    })
    .finally(() => { buildingPromise = null; });
  return buildingPromise;
}

/* ============ 关键词检索（离线兜底） ============ */
// CJK 二元组 + 拉丁/谚文词元覆盖打分：对"은/는 区别""敬语 怎么用"这类短查询足够准
function tokenize(q) {
  const text = String(q || '').toLowerCase();
  const tokens = new Set();
  for (const m of text.matchAll(/[a-z0-9]+/g)) if (m[0].length > 1) tokens.add(m[0]);
  for (const m of text.matchAll(/[\uac00-\ud7a3]{2,}/g)) {
    const run = m[0];
    tokens.add(run);
    for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2));
  }
  for (const m of text.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const run = m[0];
    for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2));
  }
  // 单个谚文字母也可能是检索词（如 ㄹ、ㅂ不规则）
  for (const m of text.matchAll(/[ㄱ-ㅎㅏ-ㅣ]/g)) tokens.add(m[0]);
  return [...tokens];
}

function keywordScore(entry, tokens) {
  if (!tokens.length) return 0;
  const hay = (entry.title + ' ' + entry.tags.join(' ')).toLowerCase();
  const body = entry.text.toLowerCase();
  let hit = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hit += 1;       // 标题/标签命中权重高
    else if (body.includes(t)) hit += 0.55;
  }
  return hit / tokens.length;
}

/* ============ 对外检索接口 ============ */
async function search(query, { topK = 4 } = {}) {
  const q = String(query || '').trim();
  if (!q || !CORPUS.length) return { mode: 'none', results: [] };

  const idx = loadIndex();
  if (idx && !indexStale) {
    try {
      let qv = cacheGet(q);
      if (!qv) {
        const vecs = await embedTexts([q]);
        qv = vecs && vecs[0];
        if (qv) {
          queryCache.set(q, { vector: qv });
          if (queryCache.size > QUERY_CACHE_LIMIT) queryCache.delete(queryCache.keys().next().value);
        }
      }
      if (qv) {
        const byId = corpusById();
        const results = idx.items
          .map((it) => {
            const entry = byId.get(it.id);
            return entry ? { entry, score: cosine(qv, it.vector) } : null;
          })
          .filter(Boolean)
          .filter((r) => r.score >= VECTOR_SEARCH_MIN_SCORE)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK)
          .map((r) => ({
            id: r.entry.id,
            title: r.entry.title,
            category: r.entry.category,
            text: r.entry.text,
            score: Number(r.score.toFixed(4)),
            mode: 'vector'
          }));
        if (results.length) return { mode: 'vector', results };
        return { mode: 'vector', results: [] }; // 向量模式没召回归回调关键词？不：向量有阈值语义，直接返回空
      }
    } catch (e) {
      // embedding 调用失败（限流/断网/欠费）→ 本查询退回关键词
      console.warn('[rag] 向量检索失败，本查询退回关键词：', e.message);
    }
  }

  const tokens = tokenize(q);
  const results = CORPUS
    .map((entry) => ({ entry, score: keywordScore(entry, tokens) }))
    .filter((r) => r.score >= KEYWORD_SEARCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => ({
      id: r.entry.id,
      title: r.entry.title,
      category: r.entry.category,
      text: r.entry.text,
      score: Number(r.score.toFixed(4)),
      mode: 'keyword'
    }));
  return { mode: 'keyword', results };
}

function status() {
  const idx = loadIndex();
  return {
    entries: CORPUS.length,
    mode: idx && !indexStale ? 'vector' : 'keyword',
    model: idx ? idx.model : EMBED_MODEL,
    dim: idx ? idx.dim : EMBED_DIM,
    built_at: idx ? idx.built_at : null,
    stale: indexStale,
    building: !!buildingPromise
  };
}

const knowledge = {
  search,
  status,
  ensureIndexAsync,
  buildIndex,
  tokenize,
  keywordScore,
  _byId: null
};
module.exports = knowledge;
