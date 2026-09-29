// 网页版账号体系：用户名 + 密码（注册/登录）+ HMAC 签名令牌
// 零新依赖：密码用 crypto.scryptSync 加盐哈希；令牌为 base64url 的 "uid.过期时间.签名"。
// 账号文件存 data/webusers/<username>.json；学习档案复用 store.js（uid = web_<username>，天然隔离）。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_DIR = path.join(__dirname, '..', 'data', 'webusers');
const SECRET_FILE = path.join(__dirname, '..', 'data', 'auth_secret');
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 令牌有效期 30 天

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const MIN_PASSWORD_LEN = 6;

/* ---------------- 密钥：优先 AUTH_SECRET 环境变量，否则首次启动生成并落盘 ---------------- */
let _secret = null;
function secret() {
  if (_secret) return _secret;
  const env = String(process.env.AUTH_SECRET || '').trim();
  if (env.length >= 16) {
    _secret = env;
    return _secret;
  }
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  if (fs.existsSync(SECRET_FILE)) {
    try {
      const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (saved.length >= 16) {
        _secret = saved;
        return _secret;
      }
    } catch (e) { /* 损坏则重新生成 */ }
  }
  _secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, _secret, { mode: 0o600 });
  return _secret;
}

/* ---------------- 工具 ---------------- */
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function verifyPassword(password, saltHex, hashHex) {
  try {
    const { hash } = hashPassword(password, saltHex);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashHex, 'hex'));
  } catch (e) {
    return false;
  }
}

/* ---------------- 令牌：uid.exp.sig（HMAC-SHA256） ---------------- */
function signToken(uid) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = uid + '.' + exp;
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return b64url(body) + '.' + sig;
}

function verifyToken(token) {
  try {
    // 令牌格式：b64url("uid.exp") + "." + hmacSig；只解码载荷段，签名段原样比对
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const body = fromB64url(parts[0]).toString('utf8');
    const sig = parts[1];
    const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const dot = body.lastIndexOf('.');
    if (dot < 0) return null;
    const uid = body.slice(0, dot);
    const exp = Number(body.slice(dot + 1));
    if (!uid || !Number.isFinite(exp) || exp < Date.now()) return null;
    return uid;
  } catch (e) {
    return null;
  }
}

function uidFor(username) {
  return 'web_' + String(username).toLowerCase();
}

/* ---------------- 账号文件 ---------------- */
function userFilePath(username) {
  return path.join(USERS_DIR, String(username).toLowerCase() + '.json');
}

function loadAccount(username) {
  const p = userFilePath(username);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveAccount(doc) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
  const target = userFilePath(doc.username);
  const temp = target + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(doc, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, target);
}

/* ---------------- HTTP 处理器 ---------------- */
function register(req, res) {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) {
    return res.status(400).json({ error: '用户名需为 3-20 位字母、数字或下划线' });
  }
  const pwd = String(password || '');
  if (pwd.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ error: '密码至少 ' + MIN_PASSWORD_LEN + ' 位' });
  }
  if (loadAccount(name)) {
    return res.status(409).json({ error: '用户名已被注册' });
  }
  const { salt, hash } = hashPassword(pwd);
  saveAccount({
    username: name.toLowerCase(),
    uid: uidFor(name),
    salt,
    hash,
    createdAt: new Date().toISOString()
  });
  const userId = uidFor(name);
  res.json({ ok: true, token: signToken(userId), userId, username: name.toLowerCase() });
}

function login(req, res) {
  const { username, password } = req.body || {};
  const name = String(username || '').trim().toLowerCase();
  // 登录与注册同规则校验用户名：白名单本身即杜绝了文件路径注入
  if (!USERNAME_RE.test(name)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const account = loadAccount(name);
  if (!account || !verifyPassword(String(password || ''), account.salt, account.hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const userId = account.uid || uidFor(name);
  res.json({ ok: true, token: signToken(userId), userId, username: account.username });
}

function me(req, res) {
  const uid = req.authUserId;
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const username = String(uid).replace(/^web_/, '');
  res.json({ userId: uid, username });
}

/* ---------------- Express 中间件 ---------------- */
// 从 Authorization: Bearer <token> 解析身份；成功则挂 req.authUserId。
function resolveAuth(req) {
  const header = String(req.headers.authorization || '');
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verifyToken(m[1].trim());
}

// 保护 /api/*：/api/health 与 /api/auth/* 放行；其余必须携带有效令牌。
// AUTH_REQUIRED=false 时退回兼容模式（无令牌放行，供小程序联调），但带了无效令牌仍拒绝。
function middleware(req, res, next) {
  // 先尽力解析令牌身份（auth 路由如 /me 也要用），再做保护判断
  const uid = resolveAuth(req);
  if (uid) req.authUserId = uid;
  const p = req.path;
  if (p === '/health' || p.startsWith('/auth/')) return next();
  if (uid) return next();
  const hadToken = /^Bearer\s+/i.test(String(req.headers.authorization || ''));
  if (hadToken) return res.status(401).json({ error: '登录已过期，请重新登录' });
  if (String(process.env.AUTH_REQUIRED || 'true') !== 'false') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

module.exports = { register, login, me, middleware, verifyToken, uidFor };
