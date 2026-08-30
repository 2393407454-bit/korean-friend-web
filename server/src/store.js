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
      weak_points: []
    },
    session: {
      mode: '',
      scenario: null
    },
    messages: []
  };
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
      return JSON.parse(fs.readFileSync(p, 'utf8'));
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
  fs.writeFileSync(userPath(doc.userId), JSON.stringify(doc, null, 2));
}

function resetUser(uid) {
  const doc = defaultUser(sanitizeUid(uid));
  saveUser(doc);
  return doc;
}

module.exports = { loadUser, saveUser, resetUser, defaultUser };
