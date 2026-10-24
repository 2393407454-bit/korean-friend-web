<script setup>
// AI 对话主页面（自小程序 pages/chat 移植）：
// 4 种模式 + 6 快捷话题 + 3 角色 + 情景对练 + SSE 打字机 + 语音输入 + TTS + 上传 + Demo 模式
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get, post, uploadFile } from '../api/client';
import { streamChat } from '../api/stream';
import { speak, stopSpeak } from '../api/tts';
import { loadCaps, getCaps } from '../api/caps';
import { currentUid, storeGet, storeRemove, storeSet } from '../utils/storage';
import { createRecorder } from '../utils/recorder';
import { parse as mdParse } from '../utils/mdparse';
import { showToast } from '../utils/ui';
import ConfirmModal from '../components/ConfirmModal.vue';

const router = useRouter();

const MODES = [
  { label: '聊天', text: '聊天' },
  { label: '情景对练', text: '', key: 'scenario' },
  { label: '练发音', text: '练发音' },
  { label: '测水平', text: '测水平' }
];

const TOPICS = [
  { label: 'K-pop 追星', text: '我想聊 K-pop！用韩语教我几句应援话，带罗马音' },
  { label: '韩剧', text: '推荐一部适合初学者的韩剧，教我剧里的经典台词' },
  { label: '旅行问路', text: '我准备去韩国旅行，教我机场、地铁、问路的实用句子' },
  { label: '美食点餐', text: '带我在韩国餐厅点餐！教我点餐用语（场景模拟）' },
  { label: 'TOPIK 备考', text: '我在备考 TOPIK，讲一个常考语法点并出 2 道练习题' },
  { label: '日常问候', text: '教我韩国人日常打招呼的 5 种说法和使用场景' }
];

const FALLBACK_CHARACTERS = [
  { id: 'jiwoo', name: '지우 智秀', avatar: '🐯', tagline: '温柔老师' },
  { id: 'minjun', name: '민준 敏俊', avatar: '🐣', tagline: '活泼朋友' },
  { id: 'gwajang', name: '김 선생 金老师', avatar: '📚', tagline: 'TOPIK 考官' }
];

const CODE_LABEL = { G: '语法', P: '发音', V: '词汇', H: '敬语' };

// 情景库本地兜底（后端不可达时仍可用；优先使用 /api/scenarios 完整数据）
const FALLBACK_SCENARIOS = [
  { id: 'airport', icon: '✈️', name: '机场入关', name_ko: '공항 입국심사', category: '旅行', level: '入门' },
  { id: 'restaurant', icon: '🍜', name: '餐厅点餐', name_ko: '식당에서 주문하기', category: '旅行', level: '入门' },
  { id: 'subway', icon: '🚇', name: '地铁出行', name_ko: '지하철 이용', category: '旅行', level: '日常' },
  { id: 'askway', icon: '🗺️', name: '街头问路', name_ko: '길 묻기', category: '旅行', level: '日常' },
  { id: 'intro', icon: '👋', name: '初次自我介绍', name_ko: '자기소개', category: '日常生活', level: '入门' },
  { id: 'friend_plan', icon: '🎬', name: '约朋友看电影', name_ko: '친구와 약속', category: '日常生活', level: '日常' },
  { id: 'interview', icon: '💼', name: '求职面试', name_ko: '면접', category: '学习/工作', level: '进阶' }
];

const QUICK_TIPS = [
  { label: '打招呼 안녕하세요', prompt: '안녕하세요! 처음 뵙겠습니다~ 请老师纠正我的语气 😊' },
  { label: '自我介绍', prompt: '请帮我写一段简单自然的韩语自我介绍（初学者版），带罗马音和翻译' },
  { label: '常用词（礼貌语 vs 平语）', prompt: '请列出 10 个最常用的「礼貌语 vs 平语」对比，比如 안녕하세요 / 안녕' },
  { label: '问时间 / 地点', prompt: '지금 몇 시예요? / 어디예요? 这两句的用法，再给 3 个例句' }
];

/* ---------------- 响应式状态 ---------------- */
const state = reactive({
  currentMode: '聊天',
  characters: FALLBACK_CHARACTERS,
  character: FALLBACK_CHARACTERS[0],
  scenarios: FALLBACK_SCENARIOS,
  scenarioGroups: [],
  scenarioSheet: false,
  charSheet: false,
  tipSheet: false,
  currentScenario: null,
  scenarioEnding: false,
  demoMode: false,
  demoFinished: false,
  demoBusy: false,
  status: 'listening',
  messages: [],
  inputText: '',
  recording: false,
  recordTime: 0,
  ttsEnabled: storeGet('kfp_tts') !== false,
  notice: null
});

let msgSeq = 0;
const scroller = ref(null);
const imgInput = ref(null);
const docInput = ref(null);
const newSessionVisible = ref(false);
const demoExitVisible = ref(false);

/* ---------------- 打字机引擎内部状态 ---------------- */
let twBuf = '';
let twShown = 0;
let twStarted = false;
let twPendingId = null;
let twTimer = null;
let twIdx = -1;
let twDoneFlag = false;
let autoScroll = true;
let lastScrollTs = 0;
let currentTask = null; // streamChat 句柄（可中断）

/* ---------------- 录音 ---------------- */
let recorder = null;

/* ---------------- 生命周期 ---------------- */
onMounted(() => {
  loadCaps();
  loadNotice();
  groupScenarios(FALLBACK_SCENARIOS);
  loadScenarios();

  const saved = storeGet('kfp_character');
  if (saved && saved.id) state.character = saved;
  loadCharacters();

  // 演示模式：重置剧本档案，进入干净起点
  if (storeGet('kfp_demo_mode') === '1') {
    state.demoMode = true;
    post('/api/demo/reset', { userId: currentUid() }).then(() => {
      pushAssistant(
        '🎬 演示模式已开启\n\n这是一段【预置剧本】的完整学习闭环演示：测试 → 定级 → 纠错 → 错误记忆 → 掌握 → 情景复盘。\n数据与你的真实学习档案完全隔离。\n\n点击下方「下一步」开始。',
        null,
        true
      );
    }).catch(() => {
      state.demoMode = false;
      showToast('演示模式启动失败');
    });
  } else {
    pushAssistant(
      '안녕하세요! 만나서 반가워요~ 😊\n你好！我是你的韩语伙伴。\n告诉我：① 你的韩语水平？② 为什么学韩语（追星/留学/工作/兴趣）？也可以点上方话题直接开聊！',
      null,
      true
    );
    loadHistory();
  }

  // 名句页「问 AI」/ 首页「开始今日训练」联动：读取一次性预填提问并自动发送
  const prefill = storeGet('kfp_chat_prefill');
  if (prefill) {
    storeRemove('kfp_chat_prefill');
    setTimeout(() => sendText(prefill, 'text'), 300);
  }
});

onBeforeUnmount(() => {
  stopSpeak();
  if (twTimer) { clearInterval(twTimer); twTimer = null; }
  if (recorder) recorder.cancel();
  if (currentTask) currentTask.abort();
});

/* ---------------- 公告 ---------------- */
function loadNotice() {
  get('/api/notice').then((res) => {
    const n = res && res.notice;
    if (!n || !n.content) return;
    if (storeGet('kfp_notice_dismissed') === n.at) return;
    state.notice = n;
  }).catch(() => {});
}

function onNoticeClose() {
  const n = state.notice;
  if (n) storeSet('kfp_notice_dismissed', n.at);
  state.notice = null;
}

/* ---------------- 角色 ---------------- */
function loadCharacters() {
  get('/api/characters').then((res) => {
    if (res && res.characters && res.characters.length) {
      state.characters = res.characters;
      const saved = storeGet('kfp_character');
      if (saved && saved.id) {
        const found = res.characters.find((c) => c.id === saved.id);
        if (found) state.character = found;
      }
    }
  }).catch(() => {});
}

function onCharacterPick(c) {
  state.charSheet = false;
  state.character = c;
  storeSet('kfp_character', c);
  showToast('已切换：' + c.name);
}

/* ---------------- 情景对练 ---------------- */
function loadScenarios() {
  get('/api/scenarios').then((res) => {
    if (res && res.scenarios && res.scenarios.length) {
      state.scenarios = res.scenarios;
      groupScenarios(res.scenarios);
    }
  }).catch(() => {});
}

function groupScenarios(list) {
  const cats = ['旅行', '日常生活', '学习/工作'];
  state.scenarioGroups = cats
    .map((cat) => ({ cat, items: list.filter((s) => s.category === cat) }))
    .filter((g) => g.items.length);
}

function onScenarioTap(s) {
  state.scenarioSheet = false;
  state.currentScenario = s;
  state.currentMode = '情景对练';
  sendText('开始情景对练：「' + s.name + '」', 'text', { scenarioId: s.id });
}

function onScenarioEnd() {
  if (state.scenarioEnding) return;
  if (state.status === 'typing') {
    showToast('等老师说完再复盘哦');
    return;
  }
  state.scenarioEnding = true;
  post('/api/scenario/end', { userId: currentUid() }).then((res) => {
    state.scenarioEnding = false;
    if (res && res.ok && res.report) {
      pushMessage('sys', '', { report: res.report });
      state.currentScenario = null;
      state.currentMode = '聊天';
    } else {
      showToast((res && res.error) || '复盘失败，请重试');
    }
  }).catch(() => {
    state.scenarioEnding = false;
    showToast('复盘失败，请检查网络');
  });
}

/* ---------------- Demo 模式 ---------------- */
function pushDemoStep(res) {
  if (res.user_line) pushMessage('user', res.user_line);
  pushMessage('assistant', res.display || '', {
    speech: res.speech || '',
    errors: (res.errors || []).map((e) => ({ ...e, typeLabel: CODE_LABEL[e.code] || '提示' })),
    mastered: res.mastered || []
  });
  if (res.report) pushMessage('sys', '', { report: res.report });
}

function onDemoNext() {
  if (state.demoBusy || state.demoFinished) return;
  state.demoBusy = true;
  post('/api/demo/next', { userId: currentUid() }).then((res) => {
    state.demoBusy = false;
    if (res && res.ok) {
      pushDemoStep(res);
      if (res.finished) state.demoFinished = true;
    } else {
      showToast((res && res.error) || '演示加载失败');
    }
  }).catch(() => {
    state.demoBusy = false;
    showToast('演示加载失败，请检查后端');
  });
}

function onDemoRestart() {
  post('/api/demo/reset', { userId: currentUid() }).then(() => {
    state.messages = [];
    state.demoFinished = false;
    pushAssistant('🎬 演示已重置，点击「下一步」重新开始。', null, true);
  }).catch(() => showToast('重置失败，请重试'));
}

function onDemoExitConfirm() {
  demoExitVisible.value = false;
  storeRemove('kfp_demo_mode');
  storeRemove('kfp_demo_enter');
  state.demoMode = false;
  state.messages = [];
  pushAssistant(
    '안녕하세요! 만나서 반가워요~ 😊\n你好！我是你的韩语伙伴。\n告诉我：① 你的韩语水平？② 为什么学韩语（追星/留学/工作/兴趣）？也可以点上方话题直接开聊！',
    null,
    true
  );
  loadHistory();
}

/* ---------------- 新对话 / 历史 ---------------- */
function onNewSessionConfirm() {
  newSessionVisible.value = false;
  post('/api/session/new', { userId: currentUid() }).then(() => {
    state.messages = [];
    state.currentScenario = null;
    state.currentMode = '聊天';
    pushAssistant(
      '새 대화 시작! 🎉\n新对话开始啦～今天想练点什么？\n可以点上方话题，也可以直接打字或按住说话！',
      null,
      true
    );
  }).catch(() => showToast('操作失败，请重试'));
}

function loadHistory() {
  get('/api/profile/' + currentUid()).then((res) => {
    if (res && res.messages && res.messages.length) {
      const loaded = res.messages.slice(-20).filter((m) => m.content && m.content !== '…').map((m) => {
        const text = m.content;
        return m.role === 'user'
          ? { id: 'm' + ++msgSeq, role: 'user', text }
          : { id: 'm' + ++msgSeq, role: 'assistant', text, blocks: mdParse(text), sources: m.sources || [] };
      });
      state.messages = state.messages.concat(loaded);
      scrollToBottom();
    }
  }).catch(() => {});
}

/* ---------------- 消息流 ---------------- */
function pushMessage(role, text, extra = {}) {
  const id = 'm' + ++msgSeq;
  const msg = { id, role, text, ...extra };
  if (role === 'assistant' && !extra.pending && !extra.streaming) {
    msg.blocks = mdParse(text);
  }
  if (role === 'sys' && extra.report) {
    msg.report = extra.report;
  }
  state.messages.push(msg);
  scrollToBottom();
  return id;
}

// 朗读策略：不自动朗读——只有用户点「朗读」按钮时才出声
function pushAssistant(text, speech, silent) {
  pushMessage('assistant', text || '…', { speech });
}

function replaceMessage(id, text, speech) {
  const idx = state.messages.findIndex((m) => m.id === id);
  if (idx < 0) return;
  const m = state.messages[idx];
  m.text = text;
  m.speech = speech || '';
  m.pending = false;
  scrollToBottom();
}

function removeMessage(id) {
  state.messages = state.messages.filter((m) => m.id !== id);
}

/* ---------------- 发送（流式 + 打字机） ---------------- */
function onSend() {
  const text = (state.inputText || '').trim();
  if (!text || state.status === 'typing' || state.recording) return;
  state.inputText = '';
  sendText(text, 'text');
}

function sendText(text, channel, opts) {
  const cleanText = String(text || '').trim();
  if (!cleanText || state.status === 'typing' || state.recording) return false;
  pushMessage('user', cleanText);
  const pendingId = pushMessage('assistant', '', { pending: true });
  state.status = 'typing';
  scrollToBottom(true);
  twStarted = false;
  twPendingId = pendingId;

  currentTask = streamChat({
    data: {
      userId: currentUid(),
      text: cleanText,
      channel,
      mode: state.currentMode,
      characterId: state.character.id,
      scenarioId: (opts && opts.scenarioId) || undefined
    },
    onDelta: twAppend,
    onDone: (final) => twDone(pendingId, final),
    onError: (e) => twFail(pendingId, e)
  });
  return true;
}

/* ---- 打字机引擎：增量入缓冲，定时逐字上屏（50ms/3 字，降低渲染频率） ---- */
function twAppend(delta) {
  if (twDoneFlag) return;
  if (!twStarted) {
    twStarted = true;
    const idx = state.messages.findIndex((m) => m.id === twPendingId);
    if (idx < 0) return;
    twIdx = idx;
    const m = state.messages[idx];
    m.pending = false;
    m.streaming = true;
    m.text = '';
    autoScroll = true;
  }
  twBuf += delta;
  if (!twTimer) twTimer = setInterval(twTick, 50);
}

function twTick() {
  if (!twStarted) return;
  const buf = twBuf;
  const cut = buf.indexOf('@@STATE@@');
  let visibleLen = cut >= 0 ? cut : buf.length;
  if (cut < 0) {
    // 标记可能被拆成多个增量帧：末尾出现 @@ 开头的碎片时先扣住不显示
    const frag = buf.match(/@@[A-Z@]{0,9}$/);
    if (frag) visibleLen = frag.index;
  }
  if (twShown < visibleLen) {
    twShown = Math.min(visibleLen, twShown + 3);
    state.messages[twIdx].text = buf.slice(0, twShown);
    if (autoScroll !== false) scrollToBottom();
  }
}

function scrollToBottom(immediate) {
  const now = Date.now();
  if (!immediate && lastScrollTs && now - lastScrollTs < 400) return; // 滚动节流
  lastScrollTs = now;
  nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

/* 用户滚动位置跟踪：离底超过 200px 视为在回看历史，暂停自动吸底 */
function onMsgScroll() {
  const el = scroller.value;
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
  autoScroll = nearBottom;
}

function twDone(pendingId, final) {
  twDoneFlag = true;
  if (twTimer) { clearInterval(twTimer); twTimer = null; }
  // display 兜底：服务端帧缺失时用客户端缓冲文本（截掉状态行）
  let display = (final.display || '').trim();
  if (!display && twBuf) {
    const cut = twBuf.indexOf('@@STATE@@');
    display = (cut >= 0 ? twBuf.slice(0, cut) : twBuf).trim();
  }
  if (!display) display = '（AI 没有返回内容，请重新发送试试）';
  const idx = state.messages.findIndex((m) => m.id === pendingId);
  if (idx >= 0) {
    state.messages[idx] = {
      id: pendingId,
      role: 'assistant',
      text: display,
      blocks: mdParse(display),
      speech: final.speech || '',
      sources: final.sources || [],
      korean: final.korean_sentences || [],
      errors: (final.errors || []).map((e) => ({ ...e, typeLabel: CODE_LABEL[e.code] || '提示' })),
      mastered: final.mastered || [],
      pending: false,
      streaming: false
    };
  }
  state.status = 'listening';
  scrollToBottom(true);
  twBuf = '';
  twShown = 0;
  twStarted = false;
  twDoneFlag = false;
}

function twFail(pendingId, e) {
  if (twTimer) { clearInterval(twTimer); twTimer = null; }
  const partial = twShown > 0 ? '\n\n' : '';
  twBuf = '';
  twShown = 0;
  twStarted = false;
  twDoneFlag = false;
  const idx = state.messages.findIndex((m) => m.id === pendingId);
  if (idx >= 0) {
    const m = state.messages[idx];
    m.text = (m.text || '') + partial + '😵 ' + (e.message || '请求失败');
    m.pending = false;
    m.streaming = false;
  }
  state.status = 'listening';
}

/* ---------------- 模式 / 话题 ---------------- */
function onModeTap(mode) {
  if (mode.key === 'scenario') {
    state.scenarioSheet = true;
    return;
  }
  state.currentMode = mode.label;
  sendText(mode.text, 'text');
}

function onTopicTap(topic) {
  if (topic && topic.text) sendText(topic.text, 'text');
}

function onQuickTip(tip) {
  state.tipSheet = false;
  sendText(tip.prompt, 'text');
}

/* ---------------- 气泡操作 ---------------- */
let ttsTipShown = false;
function ttsTip(ok) {
  if (ok === 'stopped' || ok) return;
  if (ttsTipShown) return;
  ttsTipShown = true;
  showToast('语音播报暂不可用（后端 TTS 未就绪）', 2200);
  setTimeout(() => (ttsTipShown = false), 15000);
}

function onSpeakTap(msg) {
  const speech = msg.speech || msg.text;
  if (!speech || !state.ttsEnabled) return;
  speak(speech).then(ttsTip);
}

async function onCopyTap(msg) {
  const text = msg.text;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制');
  } catch (e) {
    showToast('复制失败，请长按文本手动复制');
  }
}

function onFollowTap(msg) {
  const sentence = msg.korean && msg.korean[0];
  if (!sentence) return;
  storeSet('kfp_practice_target', sentence);
  router.push('/pronunciation');
}

function onTtsToggle() {
  state.ttsEnabled = !state.ttsEnabled;
  storeSet('kfp_tts', state.ttsEnabled);
  if (!state.ttsEnabled) stopSpeak();
  showToast(state.ttsEnabled ? '朗读开' : '朗读关', 800);
}

/* ---------------- 语音：按住说话（上限 30 秒，ASR 限制） ---------------- */
async function onVoiceStart() {
  if (state.recording || state.status === 'typing') return;
  if (!getCaps().asr) {
    showToast('语音不可用：后端未配置 ASR');
    return;
  }
  try {
    if (!recorder) recorder = createRecorder();
    state.recording = true;
    state.recordTime = 0;
    await recorder.start({
      maxSeconds: 30,
      onTick: (sec) => { state.recordTime = sec; }
    });
  } catch (e) {
    state.recording = false;
    showToast(e.message === 'NotAllowedError' || (e && e.name) === 'NotAllowedError'
      ? '麦克风权限被拒绝，请在浏览器设置中允许'
      : '录音启动失败：' + (e.message || '未知错误'));
  }
}

async function onVoiceEnd() {
  if (!state.recording) return;
  state.recording = false;
  const res = await recorder.stop();
  if (!res || !res.blob || res.duration < 0.8) {
    return;
  }
  state.status = 'typing';
  const file = new File([res.blob], 'record.wav', { type: 'audio/wav' });
  pushMessage('user', '🎤 [语音]');
  const pendingId = pushMessage('assistant', '', { pending: true });
  uploadFile('/api/asr', file, { userId: currentUid() })
    .then((data) => {
      const text = ((data && data.text) || '').trim();
      if (!text) {
        replaceMessage(pendingId, '没听清，再说一次好吗？(다시 말씀해 주세요!)');
        state.status = 'listening';
        return;
      }
      removeMessage(pendingId);
      state.status = 'listening';
      sendText(text, 'voice');
    })
    .catch(() => {
      replaceMessage(pendingId, '😵 语音识别失败，请确认后端已配置 ASR。');
      state.status = 'listening';
    });
}

/* ---------------- 文件上传 ---------------- */
function onUploadTap() {
  if (state.status === 'typing' || state.recording) return;
  imgInput.value && imgInput.value.click();
}

function onUploadDoc() {
  if (state.status === 'typing' || state.recording) return;
  docInput.value && docInput.value.click();
}

function onImagePicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) doUpload(file, 'image');
}

function onDocPicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) doUpload(file, 'doc');
}

function doUpload(file, kind) {
  if (!file || state.status === 'typing' || state.recording) return;
  pushMessage('user', kind === 'image' ? '📎 [图片]' : '📎 [文档]');
  const pendingId = pushMessage('assistant', '', { pending: true });
  state.status = 'typing';
  uploadFile('/api/upload', file, { userId: currentUid() })
    .then((res) => {
      replaceMessage(pendingId, res.display || '(未识别到内容)', res.speech);
      state.status = 'listening';
    })
    .catch(() => {
      replaceMessage(pendingId, '😵 文件处理失败，请重试。');
      state.status = 'listening';
    });
}
</script>

<template>
  <div class="chat-page">
    <!-- 公告横幅 -->
    <div v-if="state.notice" class="notice">
      <span class="notice-tag">公告</span>
      <span class="notice-text">{{ state.notice.content }}</span>
      <button class="notice-close" @click="onNoticeClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>

    <!-- ===== 角色状态栏 ===== -->
    <header class="statusbar">
      <button class="sb-avatar" @click="state.charSheet = true">
        <span>{{ state.character.avatar }}</span>
        <span class="sb-avatar-hint">换</span>
      </button>
      <div class="sb-main">
        <div class="sb-name">{{ state.character.name }}</div>
        <div class="sb-status">
          <span class="status-dot" :class="{ 'is-typing': state.status === 'typing' }"></span>
          <span>{{ state.character.tagline }} · {{ state.status === 'typing' ? '输入中…' : '在线倾听中' }}</span>
        </div>
      </div>
      <button v-if="!state.demoMode" class="sb-new" @click="newSessionVisible = true">新对话</button>
    </header>

    <!-- 演示模式标识 -->
    <div v-if="state.demoMode" class="demo-mark">演示数据 · 预置剧本</div>

    <!-- ===== 进行中的情景条 ===== -->
    <div v-if="state.currentScenario" class="sc-bar">
      <div class="sc-info">
        <span class="sc-name">{{ state.currentScenario.name }} · {{ state.currentScenario.name_ko }}</span>
        <span class="sc-role">你面对：{{ state.currentScenario.ai_role }}</span>
      </div>
      <button class="sc-end" :class="{ 'is-off': state.scenarioEnding }" @click="onScenarioEnd">
        {{ state.scenarioEnding ? '复盘生成中…' : '结束复盘' }}
      </button>
    </div>

    <!-- ===== 模式切换 ===== -->
    <div v-if="!state.demoMode" class="modes">
      <button
        v-for="m in MODES"
        :key="m.label"
        class="chip"
        :class="{ 'chip-on': state.currentMode === m.label }"
        @click="onModeTap(m)"
      >{{ m.label }}</button>
    </div>

    <!-- ===== 话题模板 ===== -->
    <div v-if="!state.demoMode" class="topics">
      <button v-for="t in TOPICS" :key="t.label" class="topic-chip" @click="onTopicTap(t)">{{ t.label }}</button>
    </div>

    <!-- ===== 消息流 ===== -->
    <div ref="scroller" class="messages" @scroll="onMsgScroll">
      <div
        v-for="item in state.messages"
        :key="item.id"
        class="bubble-row"
        :class="item.role"
      >
        <!-- 情景复盘评分卡 -->
        <template v-if="item.role === 'sys'">
          <div class="rep-card">
            <div class="rep-head">
              <div class="rep-score-wrap">
                <div class="rep-score num">{{ item.report.score }}</div>
                <div class="rep-score-cap">/ 100</div>
              </div>
              <div class="rep-title">
                <div class="rep-t1">{{ item.report.scene_name }} · 情景复盘</div>
                <div v-if="item.report.summary" class="rep-t2">{{ item.report.summary }}</div>
              </div>
            </div>
            <div v-if="item.report.highlights && item.report.highlights.length" class="rep-sec">
              <div class="rep-sec-t is-good">做得好的</div>
              <div v-for="(h, hi) in item.report.highlights" :key="hi" class="rep-li">{{ h }}</div>
            </div>
            <div v-if="item.report.improvements && item.report.improvements.length" class="rep-sec">
              <div class="rep-sec-t is-bad">下次注意</div>
              <div v-for="(im, ii) in item.report.improvements" :key="ii" class="rep-li">{{ im }}</div>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="item.role === 'assistant'" class="ava">{{ state.character.avatar }}</div>

          <div class="bubble" :class="[item.role, { 'is-pending': item.pending }]">
            <!-- 等待首字 -->
            <div v-if="item.pending" class="pending">
              <span class="pending-label">老师在想</span>
              <span class="dots"><span class="d"></span><span class="d"></span><span class="d"></span></span>
            </div>

            <!-- 富文本渲染（完成后） -->
            <template v-else-if="item.blocks && item.blocks.length">
              <template v-for="(blk, bi) in item.blocks" :key="bi">
                <div v-if="blk.type === 'code'" class="codeblock">
                  <div v-if="blk.lang" class="cb-head">{{ blk.lang }}</div>
                  <span class="cb-body"><span v-for="(seg, si) in blk.segs" :key="si" :class="'sg-' + seg.s">{{ seg.t }}</span></span>
                </div>
                <div v-else class="line">
                  <span v-for="(seg, si) in blk.segs" :key="si" :class="'sg-' + seg.s">{{ seg.t }}</span>
                </div>
              </template>

              <div v-if="item.sources && item.sources.length" class="source-list">
                <div class="source-label">参考来源</div>
                <a
                  v-for="(source, si) in item.sources"
                  :key="source.url || si"
                  class="source-item"
                  :href="source.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="source-title">{{ source.title }}</span>
                  <span v-if="source.published_at" class="source-date">{{ source.published_at }}</span>
                </a>
              </div>

              <!-- 结构化纠错卡 -->
              <div v-if="item.errors && item.errors.length" class="cards-stack">
                <div v-for="(err, ei) in item.errors" :key="ei" class="err-card">
                  <div class="ec-head">
                    <span class="ec-type">{{ err.typeLabel }}</span>
                    <span v-if="err.point" class="ec-point">{{ err.point }}</span>
                    <span v-if="err.severity === 'high'" class="ec-sev">易错</span>
                  </div>
                  <div class="ec-line">
                    <span class="ec-wrong">{{ err.wrong }}</span>
                    <span class="ec-arrow">→</span>
                    <span class="ec-right">{{ err.right }}</span>
                  </div>
                  <div v-if="err.explain" class="ec-explain">{{ err.explain }}</div>
                </div>
              </div>

              <!-- 掌握祝贺卡 -->
              <div v-if="item.mastered && item.mastered.length" class="cards-stack">
                <div v-for="(m, mi) in item.mastered" :key="mi" class="mas-card">
                  <div class="mas-title">已掌握「{{ m.point }}」的使用</div>
                  <div v-if="m.wrong" class="ec-line">
                    <span class="ec-wrong">{{ m.wrong }}</span>
                    <span class="ec-arrow">→</span>
                    <span class="ec-right">{{ m.right }}</span>
                  </div>
                </div>
              </div>

              <!-- 操作条 -->
              <div v-if="item.role === 'assistant'" class="ops">
                <button class="op" @click="onSpeakTap(item)">朗读</button>
                <button class="op" @click="onCopyTap(item)">复制</button>
                <button v-if="item.korean && item.korean.length" class="op op-accent" @click="onFollowTap(item)">跟读</button>
              </div>
            </template>

            <!-- 流式打字中 / 纯文本 -->
            <template v-else>{{ item.text }}</template>
          </div>

          <div v-if="item.role === 'user'" class="ava ava-user">나</div>
        </template>
      </div>

      <div class="msg-end"></div>
    </div>

    <!-- ===== 录音浮层 ===== -->
    <div v-if="state.recording" class="rec-mask">
      <div class="rec-card">
        <span class="rec-badge">REC</span>
        <div class="wavebars">
          <span class="bar b1"></span><span class="bar b2"></span><span class="bar b3"></span><span class="bar b4"></span>
          <span class="bar b5"></span><span class="bar b6"></span><span class="bar b7"></span>
        </div>
        <div class="rec-hint">正在听你说韩语…</div>
        <div class="rec-sub num">{{ state.recordTime }}s / 30s</div>
        <button class="rec-stop" @click="onVoiceEnd">结束并识别</button>
        <div class="rec-tip">松开麦克风或点上方按钮结束</div>
      </div>
    </div>

    <!-- ===== 情景选择面板 ===== -->
    <div v-if="state.scenarioSheet" class="sheet-mask" @click="state.scenarioSheet = false"></div>
    <div class="sheet" :class="{ 'sheet-up': state.scenarioSheet }">
      <div class="sheet-head">
        <span class="sheet-title">역할극 · 情景对练</span>
        <button class="sheet-close" @click="state.scenarioSheet = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div class="sheet-body">
        <div class="cap" style="margin-bottom: 12px;">选择一个真实生活场景，AI 扮演其中的角色，陪你完成任务。</div>
        <div v-for="grp in state.scenarioGroups" :key="grp.cat" class="sc-cat">
          <div class="sc-cat-name">{{ grp.cat }}</div>
          <div class="sc-grid">
            <button v-for="s in grp.items" :key="s.id" class="sc-item" @click="onScenarioTap(s)">
              <span class="si-ico">{{ s.icon }}</span>
              <span class="si-info">
                <span class="si-name">{{ s.name }}</span>
                <span class="si-meta">
                  <span class="si-ko">{{ s.name_ko }}</span>
                  <span class="si-level">{{ s.level }}</span>
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 角色切换弹层 ===== -->
    <div v-if="state.charSheet" class="sheet-mask" @click="state.charSheet = false"></div>
    <div class="sheet" :class="{ 'sheet-up': state.charSheet }">
      <div class="sheet-head">
        <span class="sheet-title">선생님 · 选择老师</span>
        <button class="sheet-close" @click="state.charSheet = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div class="sheet-body char-list">
        <button v-for="c in state.characters" :key="c.id" class="char-item" @click="onCharacterPick(c)">
          <span class="char-ava">{{ c.avatar }}</span>
          <span class="char-info">
            <span class="char-name">{{ c.name }}</span>
            <span class="char-tag">{{ c.tagline }}</span>
          </span>
          <span v-if="c.id === state.character.id" class="char-on">✓</span>
        </button>
      </div>
    </div>

    <!-- ===== 快捷提问弹层 ===== -->
    <div v-if="state.tipSheet" class="sheet-mask" @click="state.tipSheet = false"></div>
    <div class="sheet" :class="{ 'sheet-up': state.tipSheet }">
      <div class="sheet-head">
        <span class="sheet-title">빠른 시작 · 快捷提问</span>
        <button class="sheet-close" @click="state.tipSheet = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div class="sheet-body">
        <button v-for="t in QUICK_TIPS" :key="t.label" class="tip-item" @click="onQuickTip(t)">{{ t.label }}</button>
      </div>
    </div>

    <!-- ===== Demo 控制条 ===== -->
    <div v-if="state.demoMode" class="demo-bar">
      <button class="db-btn" @click="demoExitVisible = true">退出</button>
      <button class="db-btn" @click="onDemoRestart">重置</button>
      <button class="db-next" :class="{ 'is-off': state.demoBusy || state.demoFinished }" @click="onDemoNext">
        {{ state.demoFinished ? '演示完成 ✓' : '下一步 →' }}
      </button>
    </div>

    <!-- ===== 底部输入栏 ===== -->
    <div v-if="!state.demoMode" class="ibar">
      <button class="ibtn" title="上传图片" @click="onUploadTap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h5l2 2.5h7a2 2 0 0 1 2 2z" transform="translate(0,-1.5)" /></svg>
      </button>
      <button class="ibtn" title="上传文档" @click="onUploadDoc">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 16.5h4" /></svg>
      </button>
      <input
        class="ti"
        v-model="state.inputText"
        placeholder="한국어로 / 用中文或韩语输入"
        @keyup.enter="onSend"
      />
      <button
        class="ibtn ibtn-mic"
        :class="{ 'is-on': state.recording }"
        @mousedown.prevent="onVoiceStart"
        @mouseup.prevent="onVoiceEnd"
        @mouseleave="state.recording && onVoiceEnd()"
        @touchstart.prevent="onVoiceStart"
        @touchend.prevent="onVoiceEnd"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></svg>
      </button>
      <button class="ibtn ibtn-tts" :class="{ 'is-on': state.ttsEnabled }" @click="onTtsToggle">
        <svg v-if="state.ttsEnabled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 6.5 9H3.5v6h3L11 18.5v-13Z" /><path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 6.5 9H3.5v6h3L11 18.5v-13Z" /><path d="M16 9.8a3.2 3.2 0 0 1 0 4.4M15 9.5l5 5m0-5-5 5" /></svg>
      </button>
      <button class="isend" :class="{ 'is-off': !state.inputText }" @click="onSend">보내기</button>
    </div>

    <!-- 隐藏文件选择 -->
    <input ref="imgInput" type="file" accept="image/*" hidden @change="onImagePicked" />
    <input ref="docInput" type="file" accept=".txt,.md,.srt,.lrc" hidden @change="onDocPicked" />

    <!-- 确认弹窗 -->
    <ConfirmModal
      :visible="newSessionVisible"
      title="开始新对话"
      content="当前对话会存入历史，确定重新开始吗？"
      @confirm="onNewSessionConfirm"
      @close="newSessionVisible = false"
    />
    <ConfirmModal
      :visible="demoExitVisible"
      title="退出演示模式"
      content="退出后回到真实 AI 对话（演示数据会保留在隔离档案中）。"
      @confirm="onDemoExitConfirm"
      @close="demoExitVisible = false"
    />
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--tabbar-h) - var(--floatbar-offset) - env(safe-area-inset-bottom));
  overflow: hidden;
}

/* ===== 公告 ===== */
.notice {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 14px 0;
  padding: 9px 12px;
  background: var(--surface-2);
  border-radius: var(--radius-m);
}
.notice-tag {
  flex: none;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  color: var(--accent-deep);
  padding-top: 2px;
}
.notice-text { flex: 1; font-size: 12.5px; color: var(--ink-2); line-height: 1.55; user-select: text; }
.notice-close { flex: none; width: 20px; height: 20px; color: var(--ink-3); cursor: pointer; }
.notice-close svg { width: 14px; height: 14px; }

/* ===== 角色状态栏 ===== */
.statusbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 14px 4px;
}
.sb-avatar {
  position: relative;
  width: 42px; height: 42px;
  border-radius: 50%;
  background: var(--accent-soft);
  display: flex; align-items: center; justify-content: center;
  font-size: 21px;
  flex-shrink: 0;
  cursor: pointer;
}
.sb-avatar:active { transform: scale(0.94); }
.sb-avatar-hint {
  position: absolute; right: -2px; bottom: -2px;
  font-size: 8px; font-weight: 700;
  background: var(--ink); color: #fff;
  border-radius: var(--radius-pill);
  padding: 1px 5px;
  border: 2px solid var(--bg);
}
.sb-main { flex: 1; min-width: 0; }
.sb-name { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.sb-status {
  display: flex; align-items: center; gap: 5px;
  margin-top: 2px;
  font-size: 11px; color: var(--ink-3);
}
.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #34B37A;
}
.status-dot.is-typing { background: var(--accent); animation: blink 1.2s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
.sb-new {
  flex: none;
  font-size: 12px; font-weight: 600;
  color: var(--ink-2);
  border: 1px solid var(--line-2);
  border-radius: var(--radius-pill);
  padding: 6px 12px;
  cursor: pointer;
  background: var(--surface);
}
.sb-new:active { background: var(--surface-2); }

/* ===== 演示标识 ===== */
.demo-mark {
  flex-shrink: 0;
  align-self: center;
  margin: 4px 14px 2px;
  padding: 3px 12px;
  font-size: 11px; font-weight: 600;
  color: var(--ink-2);
  background: var(--surface-2);
  border-radius: var(--radius-pill);
}

/* ===== 情景条 ===== */
.sc-bar {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin: 6px 14px;
  padding: 10px 13px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
}
.sc-info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sc-name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-role { font-size: 11px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-end {
  flex: none;
  font-size: 12px; font-weight: 600;
  color: #fff; background: var(--ink);
  border-radius: var(--radius-pill);
  padding: 6px 13px;
  cursor: pointer;
}
.sc-end.is-off { opacity: .55; }

/* ===== 模式/话题 ===== */
.modes, .topics {
  flex-shrink: 0;
  display: flex;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 5px 14px;
}
.modes::-webkit-scrollbar, .topics::-webkit-scrollbar { display: none; }
.topics { padding-top: 0; }
.topic-chip {
  flex: none;
  padding: 4px 11px;
  border-radius: var(--radius-pill);
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.topic-chip:active { background: var(--surface-2); color: var(--ink-2); }

/* ===== 消息流 ===== */
.messages {
  flex: 1;
  padding: 6px 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 7px;
  margin: 12px 0;
}
.bubble-row.user { justify-content: flex-end; }

.ava {
  width: 28px; height: 28px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  background: var(--accent-soft);
}
.ava-user {
  background: var(--ink);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.bubble {
  max-width: 76%;
  padding: 10px 13px;
  border-radius: 16px;
  line-height: 1.65;
  font-size: 14px;
  word-break: break-word;
  white-space: pre-wrap;
}
.bubble.assistant {
  background: var(--surface);
  border: 1px solid var(--line);
  border-bottom-left-radius: 5px;
  box-shadow: 0 1px 2px rgba(20,21,25,.03);
}
.bubble.user {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 5px;
}
.bubble.is-pending { background: var(--surface-2); border: none; }

.pending { display: flex; align-items: center; gap: 7px; }
.pending-label { font-size: 13px; font-weight: 500; color: var(--ink-3); }
.dots { display: inline-flex; gap: 4px; }
.dots .d { width: 5px; height: 5px; border-radius: 50%; background: var(--ink-3); animation: dot-jump 1.1s ease-in-out infinite; }
.dots .d:nth-child(2) { animation-delay: .15s; }
.dots .d:nth-child(3) { animation-delay: .3s; }
@keyframes dot-jump {
  0%, 100% { transform: translateY(0); opacity: .4; }
  50% { transform: translateY(-3px); opacity: 1; }
}

/* ===== 富文本 ===== */
.line { min-height: 4px; white-space: pre-wrap; }
.sg-b { font-weight: 700; }
.sg-c {
  font-family: Menlo, Consolas, monospace;
  background: var(--surface-2);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 13px;
}
.codeblock {
  background: #191A1E;
  border-radius: var(--radius-m);
  padding: 9px 11px;
  margin: 6px 0;
  overflow-x: auto;
}
.cb-head { font-size: 10px; color: #7C828D; letter-spacing: .08em; margin-bottom: 4px; }
.cb-body {
  font-family: Menlo, Consolas, monospace;
  font-size: 12px;
  color: #E8EAEE;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.sg-k { color: #8FCBFF; }
.sg-str { color: #A8E6A8; }
.sg-cm { color: #7C828D; }

/* ===== 操作条 ===== */
.ops {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-top: 8px;
}
.op {
  padding: 3px 11px;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
}
.op:active { background: var(--surface-2); }
.op-accent { color: var(--accent-deep); border-color: rgba(11,107,232,.35); }
.source-list { display: flex; flex-direction: column; gap: 4px; margin-top: 9px; padding-top: 7px; border-top: 1px solid var(--line); }
.source-label { color: var(--ink-3); font-size: 11px; font-weight: 700; }
.source-item { display: flex; flex-wrap: wrap; gap: 5px; color: var(--accent-deep); font-size: 11.5px; line-height: 1.4; text-decoration: none; }
.source-item:hover { text-decoration: underline; }
.source-date { color: var(--ink-3); }
.msg-end { height: 12px; }

/* ===== 纠错卡 / 掌握卡 ===== */
.cards-stack { margin-top: 8px; display: flex; flex-direction: column; gap: 7px; }
.err-card {
  background: var(--danger-soft);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-m);
  padding: 9px 11px;
}
.mas-card {
  background: var(--ok-soft);
  border-left: 3px solid var(--ok);
  border-radius: var(--radius-m);
  padding: 9px 11px;
}
.ec-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ec-type {
  font-size: 10px; font-weight: 700; color: var(--danger);
  background: rgba(255,255,255,.7);
  padding: 1px 7px; border-radius: var(--radius-pill);
}
.ec-point { font-size: 10px; font-weight: 600; color: var(--ink-2); background: rgba(255,255,255,.7); padding: 1px 7px; border-radius: var(--radius-pill); }
.ec-sev { font-size: 10px; font-weight: 700; color: #8A6D1A; background: rgba(255,255,255,.7); padding: 1px 7px; border-radius: var(--radius-pill); }
.ec-line { margin-top: 5px; display: flex; align-items: baseline; flex-wrap: wrap; font-size: 13.5px; line-height: 1.5; }
.ec-wrong { color: var(--danger); text-decoration: line-through; font-weight: 600; }
.ec-arrow { margin: 0 6px; color: var(--ink-3); }
.ec-right { color: var(--ok); font-weight: 700; }
.ec-explain { margin-top: 4px; font-size: 11px; color: var(--ink-2); line-height: 1.55; }
.mas-title { font-size: 12.5px; font-weight: 700; color: var(--ok); }

/* ===== 复盘评分卡 ===== */
.bubble-row.sys { justify-content: center; }
.rep-card {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-l);
  padding: 16px;
  box-shadow: var(--shadow-card);
}
.rep-head { display: flex; align-items: center; gap: 12px; }
.rep-score-wrap {
  flex: none; width: 60px; height: 60px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.rep-score { font-size: 21px; font-weight: 800; line-height: 1; }
.rep-score-cap { font-size: 8.5px; opacity: .7; margin-top: 2px; }
.rep-title { min-width: 0; }
.rep-t1 { font-size: 14px; font-weight: 700; }
.rep-t2 { margin-top: 3px; font-size: 11px; color: var(--ink-3); line-height: 1.5; }
.rep-sec { margin-top: 12px; }
.rep-sec-t { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
.rep-sec-t.is-good { color: var(--ok); }
.rep-sec-t.is-bad { color: var(--danger); }
.rep-li {
  font-size: 12px; line-height: 1.55;
  padding: 3px 0 3px 13px;
  position: relative;
  color: var(--ink-2);
}
.rep-li::before {
  content: "";
  position: absolute; left: 1px; top: 10px;
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--line-2);
}

/* ===== 录音浮层 ===== */
.rec-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 21, 25, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 99;
}
.rec-card {
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-l);
  box-shadow: var(--shadow-pop);
  padding: 22px 26px 18px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  min-width: 250px;
}
.rec-badge {
  position: absolute; top: -9px; right: 14px;
  font-size: 9px; font-weight: 800; letter-spacing: .1em;
  background: var(--danger); color: #fff;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  animation: blink 1.4s ease-in-out infinite;
}
.rec-hint { font-size: 14px; font-weight: 600; }
.rec-sub {
  font-size: 12px; font-weight: 600;
  color: var(--accent-deep);
  background: var(--accent-soft);
  padding: 3px 11px;
  border-radius: var(--radius-pill);
}
.rec-stop {
  margin-top: 3px;
  background: var(--ink);
  color: #fff;
  font-size: 14px; font-weight: 600;
  padding: 9px 26px;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.rec-stop:active { transform: scale(0.96); }
.rec-tip { font-size: 11px; color: var(--ink-3); }

/* ===== 底部弹层 ===== */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 21, 25, 0.42);
  backdrop-filter: blur(2px);
  z-index: 90;
  animation: fade .2s ease-out;
}
.sheet {
  position: fixed;
  left: 50%; bottom: 0;
  transform: translateX(-50%) translateY(100%);
  width: 100%;
  max-width: 480px;
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  padding: 16px 16px calc(env(safe-area-inset-bottom) + 12px);
  max-height: 72dvh;
  transition: transform .28s cubic-bezier(.22,.61,.36,1);
  z-index: 91;
  display: flex;
  flex-direction: column;
}
.sheet-up { transform: translateX(-50%) translateY(0); }
.sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.sheet-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.sheet-close {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--ink-2);
  cursor: pointer;
}
.sheet-close svg { width: 14px; height: 14px; }
.sheet-body { flex: 1; min-height: 0; overflow-y: auto; }
.sc-cat { margin-bottom: 14px; }
.sc-cat-name { font-size: 11px; font-weight: 600; color: var(--ink-3); margin-bottom: 8px; letter-spacing: .04em; }
.sc-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.sc-item {
  width: calc(50% - 4px);
  display: flex; align-items: center; gap: 8px;
  padding: 11px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
  cursor: pointer;
  text-align: left;
}
.sc-item:active { background: var(--surface-2); }
.si-ico { font-size: 18px; flex: none; }
.si-info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.si-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.si-meta { display: flex; align-items: center; gap: 5px; }
.si-ko { font-size: 10px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.si-level { flex: none; font-size: 9px; font-weight: 600; color: var(--accent-deep); background: var(--accent-soft); border-radius: var(--radius-pill); padding: 1px 6px; }

.char-list { padding-bottom: 8px; }
.char-item {
  display: flex; align-items: center; gap: 11px;
  width: 100%;
  padding: 12px 8px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  text-align: left;
}
.char-item:last-child { border-bottom: none; }
.char-item:active { background: var(--bg); }
.char-ava {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--accent-soft);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex: none;
}
.char-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.char-name { font-size: 15px; font-weight: 600; }
.char-tag { font-size: 11px; color: var(--ink-3); }
.char-on { color: var(--accent); font-weight: 700; }

.tip-item {
  display: block;
  width: 100%;
  padding: 13px 8px;
  border-bottom: 1px solid var(--line);
  font-size: 14px; font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.tip-item:last-child { border-bottom: none; }
.tip-item:active { background: var(--bg); }

/* ===== Demo 控制条 ===== */
.demo-bar {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--line);
}
.db-btn {
  flex: none;
  padding: 8px 14px;
  font-size: 12.5px; font-weight: 600;
  color: var(--ink-2);
  background: var(--surface-2);
  border-radius: var(--radius-m);
  cursor: pointer;
}
.db-next {
  flex: 1;
  text-align: center;
  padding: 9px 14px;
  font-size: 13.5px; font-weight: 600;
  color: #fff;
  background: var(--danger);
  border-radius: var(--radius-m);
  cursor: pointer;
}
.db-next.is-off { background: #C9CAC6; }

/* ===== 底部输入栏 ===== */
.ibar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-top: 1px solid var(--line);
  transition: box-shadow 0.2s ease;
}
.ibar:focus-within {
  box-shadow: 0 -4px 16px rgba(11, 107, 232, 0.06);
}
.ibtn {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: transparent;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-3);
  flex-shrink: 0;
  cursor: pointer;
  transition: all .18s ease;
  touch-action: none;
}
.ibtn svg { width: 19px; height: 19px; }
.ibtn:active { transform: scale(0.92); background: var(--surface-2); color: var(--ink-2); }
@media (hover: hover) {
  .ibtn:hover { background: var(--surface-2); color: var(--ink-2); }
}
.ibtn-mic.is-on { background: var(--danger); color: #fff; animation: mic-pulse 1.4s ease-in-out infinite; }
.ibtn-tts.is-on { color: var(--accent); }
@keyframes mic-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}

.ti {
  flex: 1;
  min-width: 0;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  padding: 8px 14px;
  font-size: 16px; /* ≥16px：避免手机浏览器聚焦输入时自动放大页面 */
  color: var(--ink);
  transition: all .18s ease;
}
.ti:focus { background: var(--surface); border-color: var(--line-2); box-shadow: 0 0 0 3px rgba(11, 107, 232, 0.08); }
.ti::placeholder { color: var(--ink-3); }

.isend {
  flex-shrink: 0;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 9px 15px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all .18s ease;
}
.isend:active { transform: scale(0.95); background: var(--accent-deep); }
.isend.is-off { background: #C9CAC6; }
@media (hover: hover) {
  .isend:not(.is-off):hover { box-shadow: 0 4px 12px rgba(11, 107, 232, 0.25); }
}
</style>
