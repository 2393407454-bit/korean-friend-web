// 用户状态存储：单机 JSON 文件版（MVP）。
// 上线放量后建议换 SQLite/Postgres，本模块接口保持不变即可。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'users');

function nowISO() {
  return new Date().toISOString();
}

function defaultUser(userId) {
  return {
    userId,
    createdAt: nowISO(),
    profile: {
      nickname: '',
      avatar: '',
      goal: '',
      interests: [],
      level: '',
      korean_ratio: 0.3,
      romanization: true
    },
    progress: {
      grammar_mastered: [],
      grammar_learning: [],
      vocab: [],
      error_log: [],
      weak_points: [],
      // 能力评分（Phase 4+）：数据驱动估算，缺证据的维度为 null（前端显示「待评估」）
      scores: null,        // { vocabulary, grammar, pronunciation, fluency, naturalness, overall, basis:{...}, at }
      score_history: [],   // 评分快照（趋势图用，最多 30 条）
      pron_eval_log: [],   // 跟读评分记录（真实 ASR+AI 证据，最多 60 条）
      pron_mastered: [],   // 用户标记「我会了」的跟读句（Phase 9，真实落库）
      quality_log: [],     // 对话中 AI 定性评估（流畅度/自然度，Phase 5 协议写入）
      scenario_reports: [], // 情景对练复盘记录（Phase 8，最多 20 条）
      song_lessons: []     // K-pop 歌词课程（用户确认歌名后保存，最多 30 首）
    },
    stats: {
      daily: {},           // 'YYYY-MM-DD' -> { turns, errors, new_words, pron_tries }
      streak_days: 0,
      last_active_date: ''
    },
    session: {
      mode: '',
      scenario: null
    },
    messages: []
  };
}

// 旧档案补齐新字段：保证所有落盘档案向下兼容、下游代码无需判空
function normalize(doc) {
  const base = defaultUser(doc.userId);
  doc.profile = Object.assign({}, base.profile, doc.profile || {});
  const pr = doc.progress || {};
  doc.progress = Object.assign({}, base.progress, pr);
  for (const k of ['grammar_mastered', 'grammar_learning', 'vocab', 'error_log', 'weak_points', 'score_history', 'pron_eval_log', 'pron_mastered', 'quality_log', 'scenario_reports', 'song_lessons']) {
    if (!Array.isArray(doc.progress[k])) doc.progress[k] = [];
  }
  doc.stats = Object.assign({}, base.stats, doc.stats || {});
  doc.stats.daily = doc.stats.daily || {};
  doc.session = Object.assign({}, base.session, doc.session || {});
  doc.messages = Array.isArray(doc.messages) ? doc.messages : [];
  return doc;
}

function sanitizeUid(uid) {
  const s = String(uid || '').trim();
  if (!/^[\w-]{1,64}$/.test(s)) throw new Error('invalid userId');
  return s;
}

function userPath(uid) {
  return path.join(DATA_DIR, uid + '.json');
}

function loadUser(uid) {
  const id = sanitizeUid(uid);
  const p = userPath(id);
  if (fs.existsSync(p)) {
    try {
      return normalize(JSON.parse(fs.readFileSync(p, 'utf8')));
    } catch (e) {
      console.warn('[store] 损坏的档案，已重建：', id);
    }
  }
  const doc = defaultUser(id);
  saveUser(doc);
  return doc;
}

function saveUser(doc) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = userPath(doc.userId);
  const temp = target + '.' + process.pid + '.tmp';
  const payload = JSON.stringify(doc, null, 2);
  try {
    // 同目录临时文件 + rename：避免进程中断时留下半截 JSON。
    fs.writeFileSync(temp, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, target);
  } catch (e) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (cleanupError) { /* 忽略清理异常 */ }
    throw e;
  }
}

function resetUser(uid) {
  const doc = defaultUser(sanitizeUid(uid));
  saveUser(doc);
  return doc;
}

module.exports = { loadUser, saveUser, resetUser, defaultUser, normalize };
