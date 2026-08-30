// 留言板：用户→开发者（feedback，可推送企业微信群=微信里可见）+ 开发者→用户（notice 公告）
const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const NOTICE_FILE = path.join(DATA_DIR, 'notice.json');

function load(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function adminKey() {
  return process.env.ADMIN_KEY || 'kfp-admin'; // 生产环境务必在 .env 改掉
}

function checkKey(key) {
  return !!key && String(key) === adminKey();
}

function addFeedback({ userId, nickname, content }) {
  const list = load(FEEDBACK_FILE, []);
  const item = {
    id: 'f' + Date.now() + Math.random().toString(36).slice(2, 5),
    userId,
    nickname: String(nickname || '').slice(0, 30),
    content: String(content).slice(0, 500),
    at: new Date().toISOString(),
    type: 'feedback'
  };
  list.push(item);
  save(FEEDBACK_FILE, list.slice(-200));
  return item;
}

function listFeedback() {
  return load(FEEDBACK_FILE, []).slice(-100).reverse(); // 最新的在前
}

function setNotice(content) {
  const n = { content: String(content).slice(0, 300), at: new Date().toISOString() };
  save(NOTICE_FILE, n);
  return n;
}

function getNotice() {
  const n = load(NOTICE_FILE, null);
  return n && n.content ? n : null;
}

// 推送到企业微信群机器人（在 .env 配置 WECOM_WEBHOOK）→ 开发者在微信里直接看到
function pushToWecom(item) {
  const hook = process.env.WECOM_WEBHOOK;
  if (!hook) return;
  const payload = JSON.stringify({
    msgtype: 'markdown',
    markdown: {
      content:
        '**📝 收到用户留言**\n' +
        '> 昵称：<font color="comment">' + (item.nickname || '匿名') + '</font>\n' +
        '> 内容：' + item.content + '\n' +
        '> 时间：<font color="comment">' + item.at.slice(0, 16).replace('T', ' ') + '</font>'
    }
  });
  const req = https.request(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, () => {});
  req.on('error', (e) => console.warn('[feedback] 企业微信推送失败：', e.message));
  req.write(payload);
  req.end();
}

module.exports = { addFeedback, listFeedback, setNotice, getNotice, checkKey, pushToWecom, adminKey };
