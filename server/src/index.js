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
const feedback = require('./feedback');

const app = express();
app.use(express.json({ limit: '8mb' }));

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
    const { userId, text, channel, mode, frame_base64, characterId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const out = await agent.handleChat({ userId, text: text || '', channel: channel || 'text', mode, frameBase64: frame_base64, characterId });
    res.json(out);
  } catch (e) {
    console.error('[chat]', e.message);
    res.status(e.status === 429 ? 429 : 500).json({ error: e.message });
  }
});

// 流式对话：SSE 帧 data: {"t":"增量"} … data: {"done":true,...}
// 非 ASCII 全部 \u 转义，规避前端分块截断多字节字符的问题
app.post('/api/chat/stream', async (req, res) => {
  const { userId, text, channel, mode, characterId } = req.body || {};
  if (!userId || !text) return res.status(400).json({ error: 'userId/text required' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const esc = (s) => JSON.stringify(s).replace(/[\u0080-\uFFFF]/g, (m) => '\\u' + m.charCodeAt(0).toString(16).padStart(4, '0'));
  const send = (obj) => {
    const body = Object.keys(obj)
      .map((k) => '"' + k + '":' + (typeof obj[k] === 'string' ? esc(obj[k]) : JSON.stringify(obj[k] ?? null)))
      .join(',');
    res.write('data: {' + body + '}\n\n');
  };

  try {
    const final = await agent.handleChatStream({
      userId, text, channel: channel || 'text', mode, characterId,
      onDelta: (d) => send({ t: d })
    });
    send({ done: true, display: final.display, speech: final.speech, korean_sentences: final.korean_sentences, profile: final.profile });
  } catch (e) {
    console.error('[chat/stream]', e.message);
    send({ error: e.status === 429 ? e.message : '服务开小差了：' + e.message });
  }
  res.end();
});

app.get('/api/characters', (req, res) => {
  res.json({ characters: characters.list(), default: characters.DEFAULT_ID });
});

app.post('/api/session/new', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(agent.archiveSession(userId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/asr', upload.single('file'), async (req, res) => {
  try {
    const text = await llm.transcribe(req.file.path);
    fs.unlink(req.file.path, () => {});
    res.json({ text: text || '' });
  } catch (e) {
    console.error('[asr]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const audioBase64 = await llm.synthesize((req.body && req.body.text) || '');
    res.json({ audio_base64: audioBase64 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const userId = req.body.userId;
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
    const target = (req.body && req.body.target) || '';
    if (!target) return res.status(400).json({ error: 'target required' });
    const out = await agent.handlePronounce({ target, audioPath: req.file.path });
    fs.unlink(req.file.path, () => {});
    res.json(out);
  } catch (e) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('[pronounce]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pronounce/lessons', async (req, res) => {
  try {
    const { userId, refresh } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const out = await agent.handleLessons({ userId, refresh: !!refresh });
    res.json(out);
  } catch (e) {
    console.error('[lessons]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== 留言板：用户→开发者（仅管理员可见，推送企业微信）+ 开发者→用户（公告）=====
app.post('/api/feedback', (req, res) => {
  try {
    const { userId, nickname, content } = req.body || {};
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
    const { userId, drama, theme, level, refresh } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const out = await agent.handleDramaQuotes({ userId, drama, theme, level, refresh: !!refresh });
    res.json(out);
  } catch (e) {
    console.error('[quotes]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/profile/:uid', (req, res) => {
  res.json(store.loadUser(req.params.uid));
});

app.post('/api/profile/:uid/update', (req, res) => {
  try {
    const doc = store.loadUser(req.params.uid);
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
      const uid = (req.body && req.body.userId) || 'u';
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
    const doc = store.loadUser(req.params.uid);
    const rel = '/avatars/' + req.file.filename;
    doc.profile.avatar = rel;
    store.saveUser(doc);
    res.json({ ok: true, avatar: rel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/profile/:uid/reset', (req, res) => {
  res.json(store.resetUser(req.params.uid));
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`한국이 친구 server listening on http://localhost:${PORT}`);
  console.log('caps:', JSON.stringify(llm.caps()));
});
