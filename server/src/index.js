require('dotenv').config();
const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');

const llm = require('./llm');
const agent = require('./agent');
const store = require('./store');
const security = require('./security');
const characters = require('./characters');
const scenarios = require('./scenarios');
const feedback = require('./feedback');
const auth = require('./auth');
const knowledge = require('./knowledge');

const app = express();
app.use(express.json({ limit: '8mb' }));

// ===== 跨域支持：网页版前端异源部署时需要（如 Cloudflare Workers/Pages 托管 dist）=====
// .env 配 CORS_ORIGIN=https://korean-friend-web.xxx.workers.dev（多个用逗号分隔）；不配则不允许跨域
const CORS_ALLOWED = String(process.env.CORS_ORIGIN || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  // 预检请求直接放行（必须先于鉴权中间件，否则浏览器预检会被 401 卡住）
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ===== 网页版登录门槛：/api/* 除 health/auth 外一律需要有效令牌 =====
// AUTH_REQUIRED=false 时进入兼容模式（无令牌放行，供小程序联调），见 server/src/auth.js
app.use('/api', auth.middleware);

// 网页版账号：注册 / 登录 / 令牌换身份
app.post('/api/auth/register', auth.register);
app.post('/api/auth/login', auth.login);
app.get('/api/auth/me', auth.me);

// 登录后端点统一取身份：令牌身份优先，防止伪造 userId。
// uid 白名单与 store.js 一致（仅字母/数字/下划线/连字符，不含点号，杜绝路径穿越）
const UID_RE = /^[\w-]{1,64}$/;
function safeUid(uid) {
  const s = String(uid || '');
  return UID_RE.test(s) ? s : '';
}
const authed = (req) => safeUid(req.authUserId || (req.body && req.body.userId) || '');

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + (file.originalname || 'file').replace(/[^\w.]/g, '_'))
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get('/api/health', (req, res) => {
  res.json(llm.caps());
});

// RAG 知识库状态与检索调试端点（答辩/演示用：能看到检索模式与命中依据）
app.get('/api/rag/status', (req, res) => {
  res.json(knowledge.status());
});
app.post('/api/rag/search', async (req, res) => {
  try {
    const query = String((req.body && req.body.query) || '').trim();
    if (!query) return res.status(400).json({ error: 'query required' });
    res.json(await knowledge.search(query, { topK: Math.min(Number((req.body || {}).topK) || 4, 8) }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/session', async (req, res) => {
  const { code, deviceId } = req.body || {};
  try {
    const userId = await security.codeToSession(code, deviceId);
    res.json({ userId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { text, channel, mode, frame_base64, characterId, scenarioId } = req.body || {};
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const out = await agent.handleChat({ userId, text: text || '', channel: channel || 'text', mode, frameBase64: frame_base64, characterId, scenarioId });
    res.json(out);
  } catch (e) {
    console.error('[chat]', e.message);
    res.status(e.status === 429 ? 429 : 500).json({ error: e.message });
  }
});

// 流式对话：SSE 帧 data: {"t":"增量"} … data: {"done":true,...}
// 非 ASCII 全部 \u 转义，规避前端分块截断多字节字符的问题
app.post('/api/chat/stream', async (req, res) => {
  const { text, channel, mode, characterId, scenarioId } = req.body || {};
  const userId = authed(req);
  if (!userId || !text) return res.status(400).json({ error: 'userId/text required' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 整帧一次 JSON.stringify（天然转义引号/换行）后再把非 ASCII \u 转义，
  // 输出恒为合法 JSON 文本帧，避免任何手工拼接造成的注入面。
  const escapeSseFrame = (obj) => 'data: ' + JSON.stringify(obj).replace(/[\u0080-\uFFFF]/g, (m) => '\\u' + m.charCodeAt(0).toString(16).padStart(4, '0')) + '\n\n';
  const send = (obj) => {
    res.write(escapeSseFrame(obj));
  };

  try {
    const final = await agent.handleChatStream({
      userId, text, channel: channel || 'text', mode, characterId, scenarioId,
      onDelta: (d) => send({ t: d }),
      onTool: (e) => send({ tool: e })
    });
    send({ done: true, display: final.display, speech: final.speech, sources: final.sources || [], tools_used: final.tools_used || [], korean_sentences: final.korean_sentences, errors: final.errors, mastered: final.mastered, profile: final.profile });
  } catch (e) {
    console.error('[chat/stream]', e.message);
    send({ error: e.status === 429 ? e.message : '服务开小差了：' + e.message });
  }
  res.end();
});

app.get('/api/characters', (req, res) => {
  res.json({ characters: characters.list(), default: characters.DEFAULT_ID });
});

// 情景对练场景库
app.get('/api/scenarios', (req, res) => {
  res.json({ scenarios: scenarios.list() });
});

// 结束情景并生成复盘
app.post('/api/scenario/end', async (req, res) => {
  try {
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(await agent.handleScenarioEnd({ userId }));
  } catch (e) {
    console.error('[scenario/end]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 结构化学习报告（数据引擎 + AI 评语可选增强）
app.post('/api/report', async (req, res) => {
  try {
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(await agent.handleReport({ userId }));
  } catch (e) {
    console.error('[report]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// —— Demo 模式（Phase 12）：预置剧本，比赛现场零网络风险 ——
app.post('/api/demo/next', (req, res) => {
  try {
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(agent.handleDemoNext({ userId }));
  } catch (e) {
    console.error('[demo]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/demo/reset', (req, res) => {
  try {
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(agent.handleDemoReset({ userId }));
  } catch (e) {
    console.error('[demo]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/session/new', async (req, res) => {
  try {
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(agent.archiveSession(userId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/asr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'audio file required' });
    const text = await llm.transcribe(req.file.path);
    res.json({ text: text || '' });
  } catch (e) {
    console.error('[asr]', e.message);
    res.status(e.status === 429 ? 429 : 503).json({ error: '语音识别暂时不可用，请重试' });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || '').trim().slice(0, 400);
    if (!text) return res.status(400).json({ error: 'text required' });
    const audioBase64 = await llm.synthesize(text);
    res.json({ audio_base64: audioBase64 });
  } catch (e) {
    res.status(503).json({ error: '语音播报暂时不可用，请稍后重试' });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const userId = req.authUserId || req.body.userId;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const out = await agent.handleUpload({ userId, file: req.file, mode: req.body.mode });
    res.json(out);
  } catch (e) {
    console.error('[upload]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pronounce', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'audio file required' });
    const target = (req.body && req.body.target) || '';
    if (!target) return res.status(400).json({ error: 'target required' });
    const out = await agent.handlePronounce({ target, audioPath: req.file.path, userId: req.authUserId || (req.body && req.body.userId) || '' });
    res.json(out);
  } catch (e) {
    console.error('[pronounce]', e.message);
    res.status(e.status === 503 ? 503 : 500).json({ error: e.message });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

app.post('/api/pronounce/lessons', async (req, res) => {
  try {
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const out = await agent.handleLessons({ userId, refresh: !!req.body.refresh });
    res.json(out);
  } catch (e) {
    console.error('[lessons]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 「我会了」持久化（Phase 9）
app.post('/api/pronounce/mastered', (req, res) => {
  try {
    const { target } = req.body || {};
    const userId = authed(req);
    if (!userId || !target) return res.status(400).json({ error: 'userId/target required' });
    res.json(agent.markPronMastered(userId, target));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== K-pop 歌词学习：识别候选 + 结构化划分 + 保存 + 生词入本 =====
app.post('/api/song/analyze', upload.single('file'), async (req, res) => {
  try {
    let imageB64 = null;
    let text = (req.body && req.body.text) || '';
    const source = (req.body && req.body.source) || '';
    const file = req.file;
    const ext = file ? path.extname(file.originalname || '').toLowerCase() : '';
    const isImage = !!(file && /^image\//.test(file.mimetype || ''));
    const isTextFile = !!(file && ext === '.lrc');
    let songMeta = null;

    if (isImage) {
      imageB64 = fs.readFileSync(file.path).toString('base64');
    } else if (file && isTextFile) {
      // LRC 先在服务端去除时间戳/元数据，再把纯歌词原文交给 AI，避免模型把标签当歌词。
      const lrc = fs.readFileSync(file.path, 'utf8').replace(/^\uFEFF/, '');
      const titleMatch = lrc.match(/^\s*\[ti:(.*?)\]\s*$/im);
      const artistMatch = lrc.match(/^\s*\[ar:(.*?)\]\s*$/im);
      songMeta = {
        title: titleMatch && titleMatch[1] ? titleMatch[1].trim() : '',
        artist: artistMatch && artistMatch[1] ? artistMatch[1].trim() : ''
      };
      const lyricLines = lrc.split(/\r?\n/).map((line) => {
        return line.replace(/^\s*(?:\[[0-9]{1,2}:\d{2}(?:\.\d{1,3})?\])+\s*/, '').trim();
      }).filter((line) => line && !/^\[(?:ti|ar|al|by|offset):/i.test(line));
      const header = [];
      if (titleMatch && titleMatch[1].trim()) header.push('歌名: ' + titleMatch[1].trim());
      if (artistMatch && artistMatch[1].trim()) header.push('歌手: ' + artistMatch[1].trim());
      text = (header.length ? ['【LRC 元数据，仅用于识别歌名和歌手，不是歌词】'].concat(header, ['【LRC 歌词原文】']) : []).concat(lyricLines).join('\n');
    } else if (file) {
      return res.status(400).json({ error: '只支持图片或 LRC 歌词文件' });
    }

    const out = await agent.handleSongAnalyze({
      text,
      imageB64,
      source: source || (isImage ? 'image' : (isTextFile ? 'lrc' : 'paste')),
      songMeta
    });
    res.json(out);
  } catch (e) {
    console.error('[song/analyze]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

app.post('/api/song/save', (req, res) => {
  try {
    const { title, artist, summary, lines } = req.body || {};
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(agent.handleSongSave({ userId, title, artist, summary, lines }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/song/vocab', (req, res) => {
  try {
    const { ko, zh } = req.body || {};
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(agent.handleSongVocab({ userId, ko, zh }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/song/list/:uid', (req, res) => {
  try {
    res.json(agent.handleSongList(safeUid(req.authUserId || req.params.uid)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/song/delete', (req, res) => {
  try {
    const { songId } = req.body || {};
    const userId = authed(req);
    if (!userId || !songId) return res.status(400).json({ error: 'userId/songId required' });
    res.json(agent.handleSongDelete(userId, songId));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.get('/api/song/get/:uid/:songId', async (req, res) => {
  try {
    res.json(await agent.handleSongGet(safeUid(req.authUserId || req.params.uid), req.params.songId));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// ===== 留言板：用户→开发者（仅管理员可见，推送企业微信）+ 开发者→用户（公告）=====
app.post('/api/feedback', (req, res) => {
  try {
    const { nickname, content } = req.body || {};
    const userId = authed(req);
    if (!content || !String(content).trim()) return res.status(400).json({ error: 'content required' });
    const item = feedback.addFeedback({ userId: userId || '', nickname, content: String(content).trim() });
    feedback.pushToWecom(item); // 配置了 WECOM_WEBHOOK 才会实际推送
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/notice', (req, res) => {
  res.json({ notice: feedback.getNotice() });
});

app.post('/api/admin/verify', (req, res) => {
  res.json({ ok: feedback.checkKey((req.body || {}).key) });
});

app.get('/api/admin/messages', (req, res) => {
  if (!feedback.checkKey(req.query.key)) return res.status(403).json({ error: '密钥错误' });
  res.json({ messages: feedback.listFeedback() });
});

app.post('/api/admin/notice', (req, res) => {
  if (!feedback.checkKey((req.body || {}).key)) return res.status(403).json({ error: '密钥错误' });
  const content = (req.body || {}).content || '';
  if (!content.trim()) return res.status(400).json({ error: 'content required' });
  res.json({ ok: true, notice: feedback.setNotice(content.trim()) });
});

app.post('/api/admin/clear-notice', (req, res) => {
  if (!feedback.checkKey((req.body || {}).key)) return res.status(403).json({ error: '密钥错误' });
  res.json({ ok: true, notice: feedback.setNotice('') });
});

app.post('/api/quotes/generate', async (req, res) => {
  try {
    const { drama, theme, level, refresh } = req.body || {};
    const userId = authed(req);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const out = await agent.handleDramaQuotes({ userId, drama, theme, level, refresh: !!refresh });
    res.json(out);
  } catch (e) {
    console.error('[quotes]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/profile/:uid', (req, res) => {
  res.json(store.loadUser(safeUid(req.authUserId || req.params.uid)));
});

// 能力画像：数据驱动评分（缺证据维度为 null = 待评估）
app.get('/api/abilities/:uid', (req, res) => {
  try {
    res.json(agent.getAbilities(safeUid(req.authUserId || req.params.uid)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/profile/:uid/update', (req, res) => {
  try {
    const uid = safeUid(req.authUserId || req.params.uid);
    const doc = store.loadUser(uid);
    const { nickname } = req.body || {};
    if (typeof nickname === 'string') doc.profile.nickname = nickname.slice(0, 30);
    store.saveUser(doc);
    res.json({ ok: true, profile: doc.profile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 微信头像上传：存到 data/avatars 并以静态 URL 返回（profile.avatar 存相对路径）
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'data', 'avatars'),
    filename: (req, file, cb) => {
      const uid = req.authUserId || (req.body && req.body.userId) || 'u';
      const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
      cb(null, uid.replace(/[^\w-]/g, '') + ext);
    }
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype || ''))
});
app.use('/avatars', express.static(path.join(__dirname, '..', 'data', 'avatars')));
app.post('/api/profile/:uid/avatar', avatarUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const uid = safeUid(req.authUserId || req.params.uid);
    const doc = store.loadUser(uid);
    const rel = '/avatars/' + req.file.filename;
    doc.profile.avatar = rel;
    store.saveUser(doc);
    res.json({ ok: true, avatar: rel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/profile/:uid/reset', (req, res) => {
  res.json(store.resetUser(safeUid(req.authUserId || req.params.uid)));
});

// ===== 网页版静态托管（web/dist 构建产物，与 API 同源免 CORS）=====
// 始终注册中间件：dist 可能在后端启动后才构建完成，不能把“目录不存在”缓存成永久 404。
// SPA 路由（/chat /quotes 等）仅在 index.html 已生成时回退，避免吞掉 API 404。
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(WEB_DIST));
app.get('*', (req, res, next) => {
  const indexFile = path.join(WEB_DIST, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  return next();
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;

// 列出本机所有局域网 IPv4，手机热点/换网后 IP 会变，启动日志直接给出该填进
// miniprogram/utils/config.js 的 BASE_URL
const lanIPs = () => {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
};

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`한국어 친구 server listening on http://localhost:${PORT}`);
  const ips = lanIPs();
  if (ips.length) {
    console.log('局域网访问（填入 miniprogram/utils/config.js 的 BASE_URL）:');
    for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
  }
  console.log('caps:', JSON.stringify(llm.caps()));
  // RAG 向量索引：缺失或语料已更新时后台重建（不阻塞启动，失败自动退关键词检索）
  knowledge.ensureIndexAsync();
});
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[server] 端口 ${PORT} 已被占用，请先停止旧服务或改用 PORT=...`);
  } else {
    console.error('[server] 启动失败：', err && err.message ? err.message : err);
  }
  process.exitCode = 1;
});
