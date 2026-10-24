// 歌词教学能力：识别「想学歌词」意图，从核实过的曲库生成确定性回复。
// 设计原则：
// 1) 命中歌词意图时不再把请求丢给 LLM 自由发挥，避免小模型编造歌词；
// 2) 回复内容一律来自 data/song-lines.js（每句都经过公开来源核实）；
// 3) 用户点名的曲库外歌曲交给联网对话链路核实，不在静态曲库范围内直接拒答。
const { SONGS } = require('./data/song-lines');

// 只在用户明确要学歌/歌词时启用静态曲库。单纯聊 K-pop、歌手或八卦必须交给对话模型。
const TRIGGER_RE = /(歌词|노래|가사|노랫말|唱一?首|唱几?句|教我.{0,8}歌|来一?首|点一?首|点歌|想听歌|一首歌|换一?首|怎么唱|学.{0,5}歌词|学.{0,5}歌)/i;

// 曲库检索（仅歌名/别名；歌手归 ARTIST_MAP，避免「아이유 Blueming」这类误配）
const LOOKUP = [
  { re: /강남\s*스타일|강남스타일|gangnam|江南\s*style/i, id: 'psy-gangnam' },
  { re: /\bdna\b/i, id: 'bts-dna' },
  { re: /봄날|spring\s*day|春日/i, id: 'bts-springday' },
  { re: /좋은\s*날|좋은날|好日子/i, id: 'iu-goodday' },
  { re: /첫눈처럼|如初雪|初雪|鬼怪|도깨비/i, id: 'ailee-firstsnow' },
  { re: /마지막처럼|像最后|as\s*if\s*it'?s\s*your\s*last/i, id: 'bp-asif' },
  { re: /모든\s*날|모든날|every\s*day|every\s*moment|所有日子|每日每刻/i, id: 'paul-everyday' },
  { re: /cheer\s*up|加油吧/i, id: 'twice-cheerup' }
];

// 歌手 → 曲库代表作（用户只提歌手或「XX的歌词」但该歌手有收录时使用）
const ARTIST_MAP = [
  { re: /방탄|bts/i, id: 'bts-dna' },
  { re: /블랙핑크|blackpink/i, id: 'bp-asif' },
  { re: /아이유|\biu\b/i, id: 'iu-goodday' },
  { re: /에일리|ailee/i, id: 'ailee-firstsnow' },
  { re: /트와이스|twice/i, id: 'twice-cheerup' },
  { re: /폴킴|paul\s*kim/i, id: 'paul-everyday' },
  { re: /싸이|psy|鸟叔/i, id: 'psy-gangnam' }
];

function levelOf(doc) {
  const lv = String((doc && doc.profile && doc.profile.level) || '');
  if (/TOPIK(1|2)/.test(lv)) return '入门';
  if (/TOPIK(5|6)/.test(lv)) return '进阶';
  return '日常';
}

// 没点名具体歌曲时：按水平挑，快慢歌混合，最多 3 首
function pickByLevel(doc) {
  const lv = levelOf(doc);
  const sameLv = SONGS.filter((s) => s.level === lv);
  const pool = sameLv.length ? sameLv : SONGS;
  const picked = [];
  for (const s of pool) {
    if (picked.length >= 3) break;
    if (!picked.some((p) => p.mood === s.mood) || picked.length < 2) picked.push(s);
  }
  for (const s of SONGS) if (picked.length < 3 && !picked.includes(s)) picked.push(s);
  return picked.slice(0, 3);
}

// 从用户输入里提取点名的歌名：《xxx》/「xxx 的歌词」
function detectNamedTitle(raw) {
  const m = raw.match(/《([^》]{1,40})》/);
  if (m) return m[1].trim();
  const m2 = raw.match(/([A-Za-z0-9'\uac00-\ud7a3][A-Za-z0-9'\s\uac00-\ud7a3]{1,28}?)\s*的\s*歌词/);
  if (m2) return m2[1].trim();
  return '';
}

function matchedSongs(text) {
  return LOOKUP.filter((m) => m.re.test(String(text || '')))
    .map((m) => SONGS.find((s) => s.id === m.id))
    .filter(Boolean);
}

// —— 教学卡片（display）与口播稿（speech，遵守 4 句以内的 TTS 规范）——
function teachBlock(song) {
  const line = song.lines[0];
  const vocab = (line.vocab || []).slice(0, 2).map((v) => v.ko + ' ' + v.zh).join('；');
  const display = [
    '🎵 《' + song.title + '》' + song.title_zh + ' — ' + song.artist + '（' + song.style + '）',
    '',
    line.ko,
    '[' + line.roman + ']',
    line.zh,
    '',
    '📌 ' + line.grammar,
    vocab ? '🔤 ' + vocab : '',
    '💡 ' + line.tip,
    '',
    '想练整首：去「K-pop 学歌页」粘贴或上传歌词，可以逐句精讲（罗马音＋翻译＋语法）＋跟读评分。'
  ].filter(Boolean).join('\n');
  const speech =
    '来学一句真的韩语歌词！' + line.ko + '，' + line.zh + '。这句话出自' + song.title_zh +
    '。想练整首的话，去 K-pop 学歌页上传歌词，我们逐句精讲，还能跟读打分。';
  return { display, speech };
}

// 命中歌词意图时返回确定性教学回复；未命中返回 null（交回正常链路）
function songTeachReply(text, doc) {
  const raw = String(text || '');
  if (!TRIGGER_RE.test(raw)) return null;

  // ① 全文命中了曲库歌名（含别名）→ 直接教这首
  const hits = matchedSongs(raw);
  if (hits.length) return teachBlock(hits[0]);

  // 文本里提到的歌手若在曲库有歌，可作为「未收录」时的替代教学
  const artistAlt = (() => {
    const hit = ARTIST_MAP.find((m) => m.re.test(raw));
    return hit ? SONGS.find((s) => s.id === hit.id) : null;
  })();

  // ② 点名了具体歌曲但本地曲库未收录：交给联网对话链路检索核实，避免曲库把请求直接挡回去。
  //    捕获可能把「歌手+歌名」一起吞下（如「BTS Butter 的歌词」），先剥掉已知歌手名
  const named = detectNamedTitle(raw);
  if (named) {
    const cleanNamed = named
      .replace(/방탄소년단|방탄|\bbts\b|블랙핑크|blackpink|아이유|\biu\b|에일리|ailee|트와이스|twice|폴킴|paul\s*kim|싸이|psy|鸟叔/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanNamed) {
      const cleanTitleHit = LOOKUP.find((m) => m.re.test(cleanNamed));
      if (cleanTitleHit) {
        const song = SONGS.find((s) => s.id === cleanTitleHit.id);
        if (song) return teachBlock(song);
      }
      return null;
    }
    // 剥完只剩歌手名（如「BTS 的歌词」）→ 教该歌手代表作
    if (artistAlt) return teachBlock(artistAlt);
    return null;
  }

  // ③ 只提歌手没说歌名：教该歌手在曲库里的代表作
  if (artistAlt) return teachBlock(artistAlt);

  // ④ 泛泛请求：按水平教一首
  return teachBlock(pickByLevel(doc)[0]);
}

// 歌曲请求交给 LLM 时，附带本地已核实样例与版权/检索边界。
function buildSongSection(text, doc) {
  if (!TRIGGER_RE.test(String(text || ''))) return '';
  const songs = pickByLevel(doc);
  const list = songs.map((s, i) => {
    const l = s.lines[0];
    return (i + 1) + '. 《' + s.title + '》' + s.title_zh + ' — ' + s.artist + ' [' + s.level + ']\n   - ' + l.ko + '（' + l.roman + '）— ' + l.zh;
  }).join('\n');
  return [
    '## 15. 歌词教学（本轮用户想学歌，曲库内容均已核实）',
    '',
    '规则（先满足用户的学习意图，再保持准确）：',
    '- 点名歌曲时可用联网搜索核对歌名、歌手、发行信息与公开介绍；只能把确实检索到的来源作为事实依据。',
    '- 不要仅因歌曲不在下方静态曲库就拒答。用户提供歌词/台词时可逐句解释；用户没提供时可讲歌曲主题、背景与语言点，或引用极短片段，不复述整段歌词。',
    '- 严禁凭记忆编造歌词、歌名、歌手或年份；严禁把通用韩语句说成某首歌的歌词。没有可靠来源时说明缺少可靠出处，并请用户贴出想学的短句。',
    '- 教学时每句韩语后紧跟中文翻译；新词按偏好附标音，并解释一个最有用的语法或词汇点。',
    '- speech 遵守 §2：4 句以内、口语化。',
    '',
    '以下是本版本已核实的本地歌词教学样例，可用于用户未指定歌曲时的推荐；不要把它当作唯一可回答的曲目范围：',
    list
  ].join('\n');
}

module.exports = { buildSongSection, songTeachReply, isSongRequest: (t) => TRIGGER_RE.test(String(t || '')) };
