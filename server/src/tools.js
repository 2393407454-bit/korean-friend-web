// Function Calling 工具集：把本地可验证的资料暴露给模型自主调用。
// 设计原则：
// 1) 工具只做"查资料"，不做状态修改——状态回写仍走 state_patch 协议，避免双写冲突；
// 2) 返回一律 JSON 字符串并截断，防超长内容撑爆上下文；
// 3) 执行器纯本地、零网络（联网检索由智谱内置 web_search 承担），失败永远返回可用结果。
const knowledge = require('./knowledge');
const songLibrary = require('./song-library');
const { SONGS } = require('./data/song-lines');

const MAX_RESULT_CHARS = 2600;

/* ============ 工具定义（OpenAI function 格式） ============ */
const FUNCTION_DEFS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description:
        '检索韩语教学知识库（语法、发音音变、近义词辨析、敬语礼仪、TOPIK 备考方法、生活语言）。' +
        '当学生问语法用法、词尾区别、发音规则、词汇辨析、考试技巧、韩国文化礼仪时调用。' +
        '返回最相关的知识条目原文，回答时基于条目内容组织讲解。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索问题，用学习者的核心疑问表述，如「은/는 与 이/가 的区别」「紧音化规则」' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_songs',
      description:
        '检索本地已核实歌词曲库（8 首 K-pop 经典曲目的逐句歌词卡：韩语原文、罗马音、中文翻译、语法点、词汇）。' +
        '当学生想学歌、问某首歌的歌词句、想找适合自己水平的歌时调用。未收录的歌曲返回空，此时如实告知。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '歌名、歌手或关键词，如「spring day」「IU」「慢歌」' },
          level: { type: 'string', enum: ['入门', '日常', '进阶'], description: '可选：按学习者水平过滤' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_vocab',
      description:
        '查询学生自己的生词本与复习队列：收录了哪些词、哪些词到了复习时间、有哪些反复出错的弱点。' +
        '当学生问「我学过哪些词」「该复习什么」「这个词我们学过吗」或需要结合学生已学词汇出例句时调用。',
      parameters: {
        type: 'object',
        properties: {
          word: { type: 'string', description: '可选：要查的具体韩语单词' }
        }
      }
    }
  }
];

const TOOL_LABELS = {
  search_knowledge: '教学知识库',
  search_songs: '歌词曲库',
  lookup_vocab: '生词本与复习队列'
};

/* ============ 检索执行器 ============ */
function songMatches(song, q) {
  const hay = [song.title, song.title_zh, song.artist, song.id].join(' ').toLowerCase();
  const needle = String(q || '').toLowerCase().trim();
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  // 分词兜底：query 里的每个词元（拉丁/谚文/汉字）任一命中即可
  return String(needle).split(/[\s,，]+/).filter(Boolean)
    .some((w) => w.length >= 2 && hay.includes(w));
}

async function execSearchKnowledge(args) {
  const query = String((args && args.query) || '').slice(0, 120);
  if (!query) return { results: [], note: '缺少检索词' };
  const { mode, results } = await knowledge.search(query, { topK: 3 });
  return {
    mode,
    note: '以下为知识库检索结果原文，回答时基于这些内容讲解；结果为空说明知识库未覆盖，按你的可靠知识回答并说明这是通用讲解。',
    results: results.map((r) => ({ title: r.title, category: r.category, text: r.text }))
  };
}

function execSearchSongs(args, doc) {
  const q = String((args && args.query) || '').trim();
  const level = args && args.level;
  let pool = SONGS;
  if (level) pool = pool.filter((s) => s.level === level);
  // 文本匹配 + 曲库别名正则（韩文歌名/歌手/中文别名）双路召回，去重合并
  const hits = pool.filter((s) => songMatches(s, q));
  for (const s of songLibrary.matchSongs(q)) {
    if (!hits.some((x) => x.id === s.id)) hits.push(s);
  }
  // 歌手/曲名没命中时按水平给候选，供推荐场景
  const list = (hits.length ? hits : pool).slice(0, 3).map((s) => ({
    title: s.title,
    title_zh: s.title_zh,
    artist: s.artist,
    level: s.level,
    style: s.style,
    verified_lines: s.lines.map((l) => ({
      ko: l.ko,
      roman: l.roman,
      zh: l.zh,
      grammar: l.grammar,
      vocab: l.vocab
    }))
  }));
  return {
    found: hits.length > 0,
    note: hits.length
      ? '以下是曲库中已核实的歌词句（可放心教学引用）；曲库外的歌曲不要编造歌词。'
      : '曲库未收录该歌曲：不要编造它的歌词，可讲歌曲背景与语言点，或请学生粘贴想学的句子。',
    songs: list
  };
}

function execLookupVocab(args, doc) {
  const word = String((args && args.word) || '').trim();
  const vocab = (doc.progress && doc.progress.vocab) || [];
  const now = Date.now();
  const due = vocab.filter((v) => v.due_at && new Date(v.due_at).getTime() <= now);
  const matched = word
    ? vocab.filter((v) => v.ko && (v.ko.includes(word) || word.includes(v.ko)))
    : [];
  return {
    vocab_total: vocab.length,
    due_count: due.length,
    due_words: due.slice(0, 10).map((v) => ({ ko: v.ko, zh: v.zh })),
    recent: vocab.slice(-8).map((v) => ({ ko: v.ko, zh: v.zh })),
    matched: matched.slice(0, 6).map((v) => ({ ko: v.ko, zh: v.zh, seen: v.seen || 1, srs_stage: v.srs_stage || 1 })),
    weak_points: (doc.progress && doc.progress.weak_points) || [],
    repeat_errors: ((doc.progress && doc.progress.error_log) || [])
      .filter((e) => (e.count || 1) >= 2).slice(-3)
      .map((e) => ({ wrong: e.wrong, right: e.right, point: e.point }))
  };
}

/* ============ 分发 ============ */
const EXECUTORS = {
  search_knowledge: execSearchKnowledge,
  search_songs: execSearchSongs,
  lookup_vocab: execLookupVocab
};

// executeCall：输入 OpenAI tool_call 对象，输出 {name, label, ok, result}
async function executeCall(toolCall, ctx) {
  const name = toolCall && toolCall.function && toolCall.function.name;
  const label = TOOL_LABELS[name] || name;
  if (!EXECUTORS[name]) {
    return { name, label, ok: false, result: JSON.stringify({ error: '未知工具：' + name }) };
  }
  let args = {};
  try {
    args = JSON.parse((toolCall.function.arguments || '{}') || '{}');
  } catch (e) {
    args = {};
  }
  try {
    const data = await EXECUTORS[name](args, ctx.doc || {});
    const result = JSON.stringify(data).slice(0, MAX_RESULT_CHARS);
    return { name, label, ok: true, result };
  } catch (e) {
    console.warn('[tools] ' + name + ' 执行失败：', e.message);
    return {
      name, label, ok: false,
      result: JSON.stringify({ error: '工具暂时不可用，请基于你的可靠知识回答，不要声称已查到资料。' })
    };
  }
}

/* ============ 触发门槛 ============ */
// 是否给本轮对话挂 function tools：语言学习/歌词/复习类问题才挂，
// 纯闲聊与时效新闻不挂（后者由 needsSearch 网关走联网搜索），控制免费档延迟。
const TOOL_HINT =
  /(语法|文法|助词|词尾|时态|变位|变形|敬语|格式体|发音|音变|连音|连读|收音|罗马音|怎么说|怎么读|怎么念|怎么写|什么意思|啥意思|有什么区别|区别|辨析|用法|例句|造句|生词|单词|词汇|背词|复习|生词本|这首歌|哪些歌|什么歌|点歌|学歌|歌词|TOPIK|토픽|考试|备考|考级|这种表达|地道|礼貌|礼仪)/i;

function shouldUse(text) {
  if (process.env.AI_TOOLS === 'false') return false;
  const t = String(text || '');
  if (TOOL_HINT.test(t)) return true;
  // 谚文词语含义类问题（与 llm.needsSearch 的第二条件同源，但这里覆盖不含时效词的情形）
  return /[\uac00-\ud7a3ㄱ-ㅎㅏ-ㅣ]/.test(t) && /(什么意思|什么含义|怎么理解|怎么用|怎么读)/.test(t);
}

module.exports = { getFunctionDefs: () => FUNCTION_DEFS, executeCall, shouldUse, TOOL_LABELS };
