<script setup>
// 我的页（自小程序 pages/profile 移植）：
// 档案概览 + 头像昵称 + 能力画像（canvas 雷达图/趋势图）+ 报告 + 重置 + 留言 + 管理员面板
import { onBeforeUnmount, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get, post, uploadFile } from '../api/client';
import { currentUid, storeGet, storeSet, clearSession } from '../utils/storage';
import { showToast } from '../utils/ui';
import ConfirmModal from '../components/ConfirmModal.vue';

const router = useRouter();

const GOAL_TEXT = {
  kpop: '追星 🎤',
  kdrama: '韩剧 📺',
  study: '留学 🎓',
  work: '工作 💼',
  travel: '旅行 ✈️',
  hobby: '兴趣 ✨'
};

const data = reactive({
  profile: {},
  progress: {},
  recentErrors: [],
  reportData: null,
  nickname: '',
  avatarUrl: '',
  accountType: '网页用户',
  vocabN: 0,
  grammarN: 0,
  errorN: 0,
  abDims: [],
  abOverall: null,
  abBasis: '',
  abHistory: [],
  historyOk: false,
  fbText: '',
  fbSending: false,
  isAdmin: !!storeGet('kfp_admin_key', ''),
  adminMessages: [],
  adminLoading: false,
  noticeDraft: ''
});

const radarCanvas = ref(null);
const trendCanvas = ref(null);
const avatarInput = ref(null);
const resetVisible = ref(false);
const adminVerifyVisible = ref(false);
const logoutVisible = ref(false);
const statInfo = ref(null); // { icon, title, value, tip }

function onLogoutConfirm() {
  logoutVisible.value = false;
  clearSession();
  router.push('/login');
}

/* 数字滚动：把目标值以动画形式一点点加出来 */
const tweens = {};
function tweenNum(field, to, duration = 800) {
  if (tweens[field]) cancelAnimationFrame(tweens[field]);
  const from = data[field] || 0;
  const start = Date.now();
  const tick = () => {
    const p = Math.min(1, (Date.now() - start) / duration);
    const ease = 1 - Math.pow(1 - p, 3);
    data[field] = Math.round(from + (to - from) * ease);
    if (p < 1) tweens[field] = requestAnimationFrame(tick);
  };
  tick();
}

function load() {
  get('/api/profile/' + currentUid()).then((res) => {
    const progress = res.progress || {};
    const profile = res.profile || {};
    profile.goalDisplay = profile.goal ? GOAL_TEXT[profile.goal] || profile.goal : '';

    const uid = currentUid();
    const vocabN = progress.vocab ? progress.vocab.length : 0;
    const grammarN = progress.grammar_mastered ? progress.grammar_mastered.length : 0;
    const errorN = progress.error_log ? progress.error_log.length : 0;

    data.profile = profile;
    data.progress = progress;
    data.nickname = profile.nickname || '';
    data.avatarUrl = profile.avatar ? (profile.avatar) : '';
    data.accountType = uid.indexOf('wx_') === 0 ? '微信用户' : (uid.indexOf('web_') === 0 ? '网页用户' : '设备访客');
    data.recentErrors = (progress.error_log || []).slice(-5).reverse();
    tweenNum('vocabN', vocabN);
    tweenNum('grammarN', grammarN);
    tweenNum('errorN', errorN);
    loadAbilities();
  }).catch(() => {});
}

/* ===== 能力画像 + 手写 canvas 图表（评分全部来自后端数据引擎） ===== */
function loadAbilities() {
  get('/api/abilities/' + currentUid()).then((res) => {
    if (!res) return;
    const history = (res.history || []).filter((h) => h.overall != null);
    data.abDims = res.dims || [];
    data.abOverall = res.overall == null ? null : res.overall;
    data.abBasis = res.overallBasis || '';
    data.abHistory = history;
    data.historyOk = history.length >= 2;
    setTimeout(drawCharts, 80);
  }).catch(() => {});
}

function drawCharts() {
  drawRadar();
  drawTrend();
}

function getCanvas(el) {
  if (!el) return null;
  const dpr = window.devicePixelRatio || 2;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return null;
  el.width = w * dpr;
  el.height = h * dpr;
  const ctx = el.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function drawRadar() {
  if (!data.abDims.length || !radarCanvas.value) return;
  const c = getCanvas(radarCanvas.value);
  if (!c) return;
  const { ctx, w, h } = c;
  const cx = w / 2;
  const cy = h / 2 + 3;
  const R = Math.min(w, h) / 2 - 22;
  const N = data.abDims.length;
  if (N < 3) return;

  ctx.clearRect(0, 0, w, h);
  // 网格：4 层
  for (let lvl = 1; lvl <= 4; lvl++) {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      const r = (R * lvl) / 4;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(14, 24, 54, 0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 轴线
  ctx.strokeStyle = 'rgba(14, 24, 54, 0.07)';
  for (let i = 0; i < N; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.stroke();
  }
  // 数据多边形
  const anyScore = data.abDims.some((d) => d.score != null);
  if (anyScore) {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const d = data.abDims[i];
      const v = d.score == null ? 0 : Math.max(6, d.score);
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      const r = (R * v) / 100;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 113, 227, 0.16)';
    ctx.fill();
    ctx.strokeStyle = '#0071E3';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 顶点 + 分数
    ctx.fillStyle = '#0071E3';
    for (let i = 0; i < N; i++) {
      const d = data.abDims[i];
      if (d.score == null) continue;
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      const r = (R * Math.max(6, d.score)) / 100;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0058C9';
      ctx.fillText(String(d.score), x, y - 8);
    }
  } else {
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#86868B';
    ctx.fillText('完成测试与训练后解锁', cx, cy);
  }
  // 维度标签
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#55565C';
  for (let i = 0; i < N; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const lx = cx + (R + 13) * Math.cos(ang);
    const ly = cy + (R + 13) * Math.sin(ang);
    ctx.textAlign = Math.abs(Math.cos(ang)) < 0.3 ? 'center' : Math.cos(ang) > 0 ? 'left' : 'right';
    ctx.textBaseline = Math.sin(ang) > 0.5 ? 'top' : Math.sin(ang) < -0.5 ? 'bottom' : 'middle';
    ctx.fillText(data.abDims[i].label, lx, ly);
  }
}

function drawTrend() {
  if (!data.historyOk || !trendCanvas.value) return;
  const c = getCanvas(trendCanvas.value);
  if (!c) return;
  const { ctx, w, h } = c;
  const hist = data.abHistory;
  if (hist.length < 2) return;
  ctx.clearRect(0, 0, w, h);
  const padL = 30, padR = 18, padT = 16, padB = 24;
  const vals = hist.map((x) => x.overall);
  let min = Math.min.apply(null, vals);
  let max = Math.max.apply(null, vals);
  if (max - min < 10) {
    const mid = (max + min) / 2;
    min = Math.max(0, mid - 8);
    max = mid + 8;
  }
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xAt = (i) => padL + (i * plotW) / (hist.length - 1);
  const yAt = (v) => padT + ((max - v) / (max - min)) * plotH;

  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#86868B';
  ctx.textAlign = 'left';
  ctx.fillText(String(Math.round(max)), 4, yAt(max) + 3);
  ctx.fillText(String(Math.round(min)), 4, yAt(min) + 3);
  ctx.strokeStyle = 'rgba(14, 24, 54, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, yAt(max));
  ctx.lineTo(w - padR, yAt(max));
  ctx.moveTo(padL, yAt(min));
  ctx.lineTo(w - padR, yAt(min));
  ctx.stroke();
  ctx.beginPath();
  hist.forEach((x, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(x.overall)) : ctx.lineTo(xAt(i), yAt(x.overall))));
  ctx.strokeStyle = '#0071E3';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineTo(xAt(hist.length - 1), h - padB);
  ctx.lineTo(xAt(0), h - padB);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 113, 227, 0.08)';
  ctx.fill();
  hist.forEach((x, i) => {
    ctx.beginPath();
    ctx.arc(xAt(i), yAt(x.overall), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0071E3';
    ctx.fill();
  });
  const lastV = hist[hist.length - 1].overall;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillStyle = '#0058C9';
  ctx.textAlign = 'right';
  ctx.fillText(String(lastV) + ' 分', w - padR, yAt(lastV) - 6);
}

/* === 留言给开发者 === */
function onFeedbackInput(e) {
  data.fbText = e.target.value;
}

function onFeedbackSubmit() {
  const content = (data.fbText || '').trim();
  if (!content) {
    showToast('先写点什么再提交哦');
    return;
  }
  if (data.fbSending) return;
  data.fbSending = true;
  post('/api/feedback', { userId: currentUid(), nickname: data.nickname || '', content })
    .then(() => {
      data.fbText = '';
      data.fbSending = false;
      showToast('已送达开发者 ✨');
    })
    .catch(() => {
      data.fbSending = false;
      showToast('发送失败，请重试');
    });
}

/* === 管理员面板（长按版本号进入） === */
let pressTimer = null;
function onVersionPressStart() {
  if (data.isAdmin) return;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    adminVerifyVisible.value = true;
  }, 600);
}
function onVersionPressEnd() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}

function onAdminVerify(key) {
  adminVerifyVisible.value = false;
  if (!key) return;
  post('/api/admin/verify', { key }).then((r) => {
    if (r && r.ok) {
      storeSet('kfp_admin_key', key);
      data.isAdmin = true;
      loadAdminMessages();
      showToast('管理员模式已开启');
    } else {
      showToast('密钥错误');
    }
  }).catch(() => showToast('验证失败'));
}

function loadAdminMessages() {
  const key = storeGet('kfp_admin_key', '');
  data.adminLoading = true;
  get('/api/admin/messages?key=' + encodeURIComponent(key)).then((res) => {
    data.adminMessages = (res && res.messages) || [];
    data.adminLoading = false;
  }).catch(() => { data.adminLoading = false; });
}

function onNoticeDraftInput(e) {
  data.noticeDraft = e.target.value;
}

function onNoticePublish() {
  const content = (data.noticeDraft || '').trim();
  if (!content) {
    showToast('先写公告内容');
    return;
  }
  const key = storeGet('kfp_admin_key', '');
  post('/api/admin/notice', { key, content }).then(() => {
    data.noticeDraft = '';
    showToast('公告已发布，用户可见 📢');
  }).catch(() => showToast('发布失败'));
}

function onNoticeClear() {
  const key = storeGet('kfp_admin_key', '');
  post('/api/admin/clear-notice', { key }).then(() => {
    data.noticeDraft = '';
    showToast('公告已撤下');
  });
}

/* === 统计卡片 === */
function onStatTap(k) {
  const map = {
    vocab:   { icon: '📒', title: '生词本',  value: data.vocabN,   tip: '坚持每天复习 10 个就行！' },
    grammar: { icon: '📚', title: '语法',   value: data.grammarN, tip: '掌握一个就少一个盲点 ✨' },
    error:   { icon: '📝', title: '错误记录', value: data.errorN,   tip: '错一次 = 赚一次记忆点' }
  };
  statInfo.value = map[k];
}

/* === 头像 + 昵称 === */
function onAvatarPick() {
  avatarInput.value && avatarInput.value.click();
}

function onAvatarPicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  data.avatarUrl = URL.createObjectURL(file); // 先本地预览
  uploadFile('/api/profile/' + currentUid() + '/avatar', file, { userId: currentUid() })
    .then((res) => {
      if (res && res.avatar) {
        data.avatarUrl = res.avatar;
        showToast('头像已保存 ✨');
      }
    })
    .catch(() => showToast('头像保存失败'));
}

function onNicknameBlur(e) {
  const v = (e.target.value || '').trim();
  if (!v || v === data.nickname) return;
  post('/api/profile/' + currentUid() + '/update', { nickname: v })
    .then(() => {
      data.nickname = v;
      showToast('昵称已保存 ✨');
    })
    .catch(() => showToast('保存失败'));
}

/* === 生成报告 === */
function onGenReport() {
  showToast('老师整理中…', 60000);
  post('/api/report', { userId: currentUid() })
    .then((res) => {
      if (res && res.report) {
        data.reportData = res.report;
      } else {
        showToast('报告生成失败，请重试');
      }
    })
    .catch(() => showToast('生成失败，请确认后端已启动'));
}

/* === 重置 === */
function onResetConfirm() {
  resetVisible.value = false;
  post('/api/profile/' + currentUid() + '/reset', {}).then(() => {
    data.reportData = null;
    data.abDims = [];
    data.abOverall = null;
    data.abHistory = [];
    data.historyOk = false;
    data.vocabN = 0;
    data.grammarN = 0;
    data.errorN = 0;
    showToast('档案已重置');
    load();
  });
}

onBeforeUnmount(() => {
  if (pressTimer) clearTimeout(pressTimer);
});

load();
if (data.isAdmin) loadAdminMessages();
</script>

<template>
  <div class="page page-tab">
    <!-- ===== 账号卡 ===== -->
    <div class="stick account-card pop pop-0">
      <div class="acc-avatar-btn" @click="onAvatarPick">
        <img v-if="data.avatarUrl" class="acc-avatar" :src="data.avatarUrl" alt="头像" />
        <div v-else class="acc-avatar acc-avatar-empty"><span>🧑</span></div>
        <span class="acc-edit">改</span>
      </div>
      <div class="acc-info">
        <input
          class="acc-nick"
          :value="data.nickname"
          placeholder="点击填写昵称"
          @blur="onNicknameBlur"
        />
        <div class="acc-meta">
          <span class="acc-type tag tag-paper">{{ data.accountType }}</span>
          <span class="acc-logout" @click="logoutVisible = true">退出登录</span>
        </div>
      </div>
    </div>

    <!-- ===== 顶部大 Banner：我的档案卡 ===== -->
    <div class="stick profile-hero pop pop-1">
      <span class="corner-stick cs-1">Lv.</span>
      <span class="corner-stick cs-2">D-1</span>

      <div class="hero-left">
        <div class="level-badge">
          <span class="level-emoji">🐯</span>
          <span class="level-text">{{ data.profile.level || '초급' }}</span>
        </div>
      </div>

      <div class="hero-right">
        <div class="hero-hello">
          <span class="doodle-underline">My</span>
          <span class="doodle-title hero-title-margin"><span class="accent">한국어</span> 档案</span>
        </div>

        <div class="goal-row">
          <span v-if="data.profile.goalDisplay" class="tag tag-coral">🎯 {{ data.profile.goalDisplay }}</span>
          <span v-else class="tag tag-paper">🤍 完成一次对话自动定级</span>
        </div>

        <div v-if="data.profile.level" class="meta-row">
          <div class="meta-chip">
            <span class="meta-k">🇰🇷 韩语配比</span>
            <span class="meta-v">{{ data.profile.korean_ratio !== undefined ? data.profile.korean_ratio * 100 : 30 }}%</span>
          </div>
          <div class="meta-chip">
            <span class="meta-k">🔤 罗马音</span>
            <span class="meta-v">{{ data.profile.romanization ? '开' : '关' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ====== 学习进度 ====== -->
    <div class="sec-head pop pop-2">
      <span class="sec-emoji">📊</span>
      <span class="sec-title">学习进度</span>
    </div>

    <div class="stats-wrap">
      <div class="stat-stick stick" @click="onStatTap('vocab')">
        <span class="stat-emoji bg-honey">📒</span>
        <span class="stat-num" style="color: var(--c-klein);">{{ data.vocabN }}</span>
        <span class="stat-label">生词本</span>
      </div>
      <div class="stat-stick stick" @click="onStatTap('grammar')">
        <span class="stat-emoji bg-mint">📚</span>
        <span class="stat-num" style="color: var(--c-klein-deep);">{{ data.grammarN }}</span>
        <span class="stat-label">已掌握语法</span>
      </div>
      <div class="stat-stick stick" @click="onStatTap('error')">
        <span class="stat-emoji bg-coral">📝</span>
        <span class="stat-num" style="color: var(--c-klein);">{{ data.errorN }}</span>
        <span class="stat-label">错误记录</span>
      </div>
    </div>

    <!-- ====== 我的韩语能力 ====== -->
    <div class="stick ab-card pop pop-5">
      <div class="ab-head">
        <div class="sec-head-inline">
          <span class="sec-emoji">📊</span>
          <span class="sec-title">我的韩语能力</span>
        </div>
        <span class="tag tag-klein ab-tag">数据驱动</span>
      </div>

      <div class="ab-overall">
        <span class="ab-num">{{ data.abOverall == null ? '—' : data.abOverall }}</span>
        <div class="ab-overall-side">
          <div class="ab-overall-t">{{ data.abOverall == null ? '综合评分 · 待评估' : '综合评分' }}</div>
          <div class="ab-overall-b">{{ data.abOverall == null ? '完成测试与训练后解锁' : data.abBasis }}</div>
        </div>
      </div>

      <canvas ref="radarCanvas" class="radar-canvas"></canvas>

      <div class="ab-dims">
        <div v-for="d in data.abDims" :key="d.key" class="ab-dim">
          <div class="ab-dim-row">
            <span class="ab-dim-label">{{ d.label }}</span>
            <div class="ab-bar">
              <div class="ab-bar-fill" :style="{ width: (d.score == null ? 0 : d.score) + '%' }"></div>
            </div>
            <span class="ab-dim-score" :class="{ pending: d.score == null }">{{ d.score == null ? '待评估' : d.score }}</span>
          </div>
          <div v-if="d.basis" class="ab-dim-basis">{{ d.basis }}</div>
        </div>
      </div>

      <div v-if="data.historyOk" class="ab-trend">
        <div class="ab-trend-title">综合能力趋势</div>
        <canvas ref="trendCanvas" class="trend-canvas"></canvas>
      </div>
      <div v-else class="ab-trend-empty">完成两次以上评估后，这里会显示能力变化趋势</div>
    </div>

    <!-- ====== 已掌握语法 ====== -->
    <template v-if="data.progress.grammar_mastered && data.progress.grammar_mastered.length">
      <div class="sec-head pop pop-6">
        <span class="sec-emoji">✅</span>
        <span class="sec-title">掌握的语法</span>
      </div>
      <div class="stick tags-card pop pop-6">
        <div class="tag-cloud">
          <span v-for="g in data.progress.grammar_mastered" :key="g" class="gram-tag">{{ g }}</span>
        </div>
      </div>
    </template>

    <!-- ====== 弱点专项 ====== -->
    <template v-if="data.progress.weak_points && data.progress.weak_points.length">
      <div class="sec-head pop pop-7">
        <span class="sec-emoji">🎯</span>
        <span class="sec-title">弱点专项</span>
      </div>
      <div class="stick weak-card pop pop-7">
        <div class="weak-title">老师帮你记下来咯</div>
        <div class="weak-points">
          <span v-for="wp in data.progress.weak_points" :key="wp" class="weak-point">{{ wp }}</span>
        </div>
      </div>
    </template>

    <!-- ====== 最近错误 ====== -->
    <template v-if="data.recentErrors.length">
      <div class="sec-head pop pop-8">
        <span class="sec-emoji">🔁</span>
        <span class="sec-title">最近错误（会安排复习）</span>
      </div>
      <div class="error-list">
        <div v-for="(item, i) in data.recentErrors" :key="i" class="stick error-item">
          <div class="err-left">
            <span class="err-ico" :class="{ 'err-ico-mastered': item.status === 'mastered' }">{{ item.status === 'mastered' ? '✅' : '❌' }}</span>
          </div>
          <div class="err-body">
            <div class="err-wrong-row">
              <span v-if="item.status !== 'mastered'" class="err-label">写错</span>
              <span v-else class="err-label err-label-ok">已掌握</span>
              <span class="err-wrong" :class="{ 'err-wrong-mastered': item.status === 'mastered' }">{{ item.wrong }}</span>
            </div>
            <div class="err-right-row">
              <span class="err-label ok">正确</span>
              <span class="err-right">{{ item.right }}</span>
            </div>
            <div v-if="item.point" class="err-point-row">
              <span class="err-point-tag">{{ item.point }}</span>
              <span v-if="item.status === 'mastered'" class="err-point-note">已脱离薄弱点列表</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ====== 结构化学习报告 ====== -->
    <div v-if="data.reportData" class="stick report-card pop pop-8">
      <div class="rc-head">
        <span class="rc-title">📈 오늘의 학습 리포트</span>
        <span class="tag tag-honey rc-tag">真实数据</span>
      </div>

      <div class="rp-stats">
        <div class="rp-stat">
          <span class="rp-num">{{ data.reportData.week.minutes_est }}</span>
          <span class="rp-k">本周练习分钟(估)</span>
        </div>
        <div class="rp-stat">
          <span class="rp-num">{{ data.reportData.week.turns }}</span>
          <span class="rp-k">对话轮数</span>
        </div>
        <div class="rp-stat">
          <span class="rp-num">{{ data.reportData.streak }}</span>
          <span class="rp-k">连续天数</span>
        </div>
        <div class="rp-stat">
          <span class="rp-num">{{ data.reportData.week.pron }}</span>
          <span class="rp-k">跟读次数</span>
        </div>
      </div>

      <div v-if="data.reportData.trend.length" class="rp-sec">
        <div class="rp-sec-t">能力变化趋势</div>
        <div v-for="t in data.reportData.trend" :key="t.key" class="rp-trend-row">
          <span class="rp-t-label">{{ t.label }}</span>
          <span class="rp-t-from">{{ t.from }}</span>
          <span class="rp-t-arrow">→</span>
          <span class="rp-t-to">{{ t.to }}</span>
          <span class="rp-t-delta" :class="t.delta >= 0 ? 'up' : 'down'">{{ t.delta >= 0 ? '↑+' : '↓' }}{{ t.delta }}</span>
        </div>
      </div>

      <div v-if="data.reportData.top_errors.length" class="rp-sec">
        <div class="rp-sec-t">高频待掌握错误（会继续安排专项训练）</div>
        <div v-for="(e, i) in data.reportData.top_errors" :key="e.wrong" class="rp-err">
          <span class="rp-err-point">{{ e.point }}</span>
          <span class="rp-err-count">×{{ e.count }}</span>
          <span class="rp-err-fix">{{ e.wrong }} → {{ e.right }}</span>
        </div>
      </div>

      <div v-if="data.reportData.ai_comment" class="rp-ai">
        <span class="rp-ai-tag">AI 评语</span>
        <span class="rp-ai-body">{{ data.reportData.ai_comment }}</span>
      </div>
      <div v-if="data.reportData.next_focus.length" class="rp-ai">
        <span class="rp-ai-tag">下次重点</span>
        <div class="rp-focus-row">
          <span v-for="f in data.reportData.next_focus" :key="f" class="rp-focus">{{ f }}</span>
        </div>
      </div>
    </div>

    <!-- ====== 底部操作按钮 ====== -->
    <div class="bottom-ops">
      <div class="btn-stick btn-honey" @click="onGenReport">✨ 生成进度报告</div>
      <div class="reset-btn" @click="resetVisible = true">重置学习档案</div>
    </div>

    <!-- ===== 留言给开发者 ===== -->
    <div class="stick fb-card pop pop-6">
      <div class="fb-head">
        <span class="fb-title">📝 留言给开发者</span>
        <span class="fb-sub">只有开发者能看到</span>
      </div>
      <textarea
        class="fb-input"
        :value="data.fbText"
        placeholder="遇到问题、想加的功能、学习建议都可以写在这里…"
        maxlength="500"
        @input="onFeedbackInput"
      ></textarea>
      <div class="fb-send" :class="{ 'fb-send-off': !data.fbText }" @click="onFeedbackSubmit">
        {{ data.fbSending ? '发送中…' : '发送留言' }}
      </div>
    </div>

    <!-- ===== 管理员面板 ===== -->
    <template v-if="data.isAdmin">
      <div class="stick fb-card pop pop-7">
        <div class="fb-head">
          <span class="fb-title">📢 发布公告</span>
          <span class="fb-sub">所有用户在对话页可见</span>
        </div>
        <textarea
          class="fb-input"
          :value="data.noticeDraft"
          placeholder="写给所有用户的公告，例如：今晚 22:00 服务升级…"
          maxlength="300"
          @input="onNoticeDraftInput"
        ></textarea>
        <div class="fb-actions">
          <span class="fb-btn fb-btn-primary" @click="onNoticePublish">📢 发布公告</span>
          <span class="fb-btn fb-btn-plain" @click="onNoticeClear">撤下公告</span>
        </div>
      </div>

      <div class="stick fb-card pop pop-7">
        <div class="fb-head">
          <span class="fb-title">📥 用户留言</span>
          <span class="fb-btn fb-btn-plain" @click="loadAdminMessages">刷新</span>
        </div>
        <div v-if="data.adminMessages.length" class="fb-list">
          <div v-for="m in data.adminMessages" :key="m.id" class="fb-item">
            <div class="fb-meta">
              <span class="fb-nick">{{ m.nickname || '匿名用户' }}</span>
              <span class="fb-time">{{ m.at }}</span>
            </div>
            <span class="fb-content">{{ m.content }}</span>
          </div>
        </div>
        <div v-else class="fb-empty">{{ data.adminLoading ? '加载中…' : '暂无留言' }}</div>
      </div>
    </template>

    <div class="version-line"
      @mousedown="onVersionPressStart"
      @mouseup="onVersionPressEnd"
      @mouseleave="onVersionPressEnd"
      @touchstart="onVersionPressStart"
      @touchend="onVersionPressEnd"
    >한국어 친구 v1.0</div>

    <div class="safe-bottom"></div>

    <!-- 隐藏文件选择 -->
    <input ref="avatarInput" type="file" accept="image/*" hidden @change="onAvatarPicked" />

    <!-- 弹窗 -->
    <ConfirmModal :visible="logoutVisible" title="退出登录" content="退出后需要重新登录才能继续学习。" ok-text="退出" danger @confirm="onLogoutConfirm" @close="logoutVisible = false" />
    <ConfirmModal :visible="resetVisible" title="重置档案" content="将清空定级、生词本和错误记录，确定吗？" ok-text="确定重置" danger @confirm="onResetConfirm" @close="resetVisible = false" />
    <ConfirmModal :visible="adminVerifyVisible" title="管理员验证" content="输入管理密钥" ok-text="验证" editable placeholder="ADMIN_KEY" @confirm="onAdminVerify" @close="adminVerifyVisible = false" />
    <ConfirmModal
      :visible="!!statInfo"
      :title="statInfo ? (statInfo.icon + ' ' + statInfo.title) : ''"
      :content="statInfo ? ('共 ' + statInfo.value + ' 条。\n' + statInfo.tip) : ''"
      :show-cancel="false"
      ok-text="好哒"
      @confirm="statInfo = null"
      @close="statInfo = null"
    />
  </div>
</template>

<style scoped>
.page { padding: 12px 12px calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px); }

/* ===== 账号卡 ===== */
.account-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.acc-avatar-btn { position: relative; cursor: pointer; flex: none; }
.acc-avatar {
  width: 52px; height: 52px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--c-sky-mist);
  display: block;
}
.acc-avatar-empty { display: flex; align-items: center; justify-content: center; font-size: 26px; }
.acc-edit {
  position: absolute; right: -2px; bottom: -2px;
  font-size: 9px; font-weight: 700;
  background: var(--c-klein); color: #fff;
  border-radius: 999px; padding: 1px 6px;
  border: 2px solid #fff;
}
.acc-info { flex: 1; min-width: 0; }
.acc-nick {
  width: 100%;
  border: none; background: none;
  font-size: 16px; font-weight: 700; color: var(--c-ink);
  padding: 2px 0;
}
.acc-nick::placeholder { color: var(--c-mute); font-weight: 400; }
.acc-type { font-size: 10px; }
.acc-meta { margin-top: 4px; display: flex; align-items: center; gap: 10px; }
.acc-logout { font-size: 10.5px; color: var(--c-coral); cursor: pointer; }

/* ===== 档案 Banner ===== */
.profile-hero {
  display: flex; align-items: center; gap: 14px;
  margin-top: 12px;
  padding: 18px 16px;
  background: linear-gradient(135deg, #FFFFFF 0%, var(--c-sky-soft) 100%);
}
.corner-stick {
  position: absolute;
  font-size: 10px; font-weight: 900;
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
}
.cs-1 { top: -7px; left: 12px; background: var(--c-klein); transform: rotate(-6deg); }
.cs-2 { bottom: -7px; right: 14px; background: var(--c-han-red); transform: rotate(5deg); }
.hero-left { flex: none; }
.level-badge {
  width: 62px; height: 62px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--shadow-soft);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.level-emoji { font-size: 22px; line-height: 1.1; }
.level-text { font-size: 10px; font-weight: 800; color: var(--c-ink-soft); }
.hero-right { flex: 1; min-width: 0; }
.hero-hello { display: flex; align-items: baseline; }
.hero-title-margin { margin-left: 6px; font-size: 17px; }
.goal-row { margin-top: 9px; }
.meta-row { margin-top: 9px; display: flex; gap: 8px; flex-wrap: wrap; }
.meta-chip {
  display: flex; align-items: center; gap: 5px;
  background: #fff; border: 1px solid var(--c-border);
  border-radius: 999px; padding: 3px 10px;
  font-size: 10.5px;
}
.meta-k { color: var(--c-ink-soft); }
.meta-v { font-weight: 800; color: var(--c-ink); }

/* ===== 学习进度 ===== */
.stats-wrap { display: flex; gap: 10px; padding: 0 2px; }
.stat-stick {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  padding: 14px 6px 12px;
  cursor: pointer;
}
.stat-stick:active { transform: scale(0.96); }
.stat-emoji {
  width: 36px; height: 36px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
}
.bg-honey { background: var(--c-honey); }
.bg-mint { background: #E5F6F1; }
.bg-coral { background: #FFE9E8; }
.stat-num { margin-top: 7px; font-size: 22px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.stat-label { margin-top: 4px; font-size: 10.5px; color: var(--c-mute); }

/* ===== 能力卡 ===== */
.ab-card { padding: 16px; margin-top: 16px; }
.ab-head { display: flex; align-items: center; justify-content: space-between; }
.sec-head-inline { display: flex; align-items: baseline; gap: 5px; }
.ab-tag { font-size: 10px !important; padding: 2px 8px !important; }
.ab-overall {
  margin-top: 12px;
  display: flex; align-items: center;
  background: #F7F8FA;
  border-radius: var(--radius-lg);
  padding: 14px 16px;
}
.ab-num { font-size: 34px; font-weight: 900; color: var(--c-ink); line-height: 1; flex: none; }
.ab-overall-side { margin-left: 14px; min-width: 0; }
.ab-overall-t { font-size: 14px; font-weight: 700; color: var(--c-ink); }
.ab-overall-b { margin-top: 3px; font-size: 11px; color: var(--c-mute); line-height: 1.5; }
.radar-canvas { width: 100%; height: 220px; margin-top: 8px; display: block; }
.ab-dims { margin-top: 6px; }
.ab-dim { margin-bottom: 9px; }
.ab-dim-row { display: flex; align-items: center; gap: 8px; }
.ab-dim-label { flex: none; font-size: 12px; color: var(--c-ink); width: 44px; }
.ab-bar { flex: 1; height: 8px; background: var(--c-cream); border-radius: 999px; overflow: hidden; }
.ab-bar-fill { height: 100%; background: linear-gradient(90deg, var(--c-klein), var(--c-klein-deep)); border-radius: 999px; transition: width 0.8s ease-out; }
.ab-dim-score { flex: none; font-size: 12px; font-weight: 700; color: var(--c-klein-deep); width: 40px; text-align: right; }
.ab-dim-score.pending { color: var(--c-mute); font-weight: 400; }
.ab-dim-basis { margin-top: 3px; font-size: 10.5px; color: var(--c-mute); padding-left: 52px; line-height: 1.5; }
.ab-trend { margin-top: 12px; }
.ab-trend-title { font-size: 13px; font-weight: 700; color: var(--c-ink); margin-bottom: 6px; }
.trend-canvas { width: 100%; height: 130px; display: block; }
.ab-trend-empty { margin-top: 12px; text-align: center; font-size: 11.5px; color: var(--c-mute); padding: 10px 0; background: #F7F8FA; border-radius: 10px; }

/* ===== 语法/弱点/错误 ===== */
.tags-card { padding: 14px 16px; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 7px; }
.gram-tag {
  padding: 4px 11px;
  border-radius: 999px;
  background: #E5F6F1;
  color: #1E7A67;
  font-size: 12px; font-weight: 600;
}
.weak-card { padding: 14px 16px; }
.weak-title { font-size: 12px; font-weight: 700; color: var(--c-mute); margin-bottom: 8px; }
.weak-points { display: flex; flex-wrap: wrap; gap: 7px; }
.weak-point {
  padding: 4px 12px;
  border-radius: 999px;
  background: #FFE9E8;
  color: var(--c-coral);
  font-size: 12px; font-weight: 700;
}
.error-list { display: flex; flex-direction: column; gap: 10px; }
.error-item { display: flex; gap: 10px; padding: 13px 14px; }
.err-left { flex: none; padding-top: 2px; }
.err-ico { font-size: 16px; }
.err-ico-mastered { opacity: 0.9; }
.err-body { flex: 1; min-width: 0; }
.err-wrong-row, .err-right-row { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
.err-right-row { margin-top: 4px; }
.err-label {
  flex: none;
  font-size: 9.5px; font-weight: 800;
  background: #FFE9E8; color: var(--c-coral);
  border-radius: 4px; padding: 1px 5px;
}
.err-label.ok { background: #E5F6F1; color: #1E7A67; }
.err-label-ok { background: #E5F6F1; color: #1E7A67; }
.err-wrong { font-size: 14px; font-weight: 700; color: var(--c-coral); text-decoration: line-through; }
.err-wrong-mastered { color: var(--c-mute); }
.err-right { font-size: 14px; font-weight: 700; color: #1E7A67; }
.err-point-row { margin-top: 5px; display: flex; align-items: center; gap: 7px; }
.err-point-tag {
  font-size: 10px; font-weight: 700;
  background: var(--c-sky-mist); color: var(--c-klein-deep);
  border-radius: 999px; padding: 1px 8px;
}
.err-point-note { font-size: 10.5px; color: var(--c-mute); }

/* ===== 报告卡 ===== */
.report-card { padding: 16px; }
.rc-head { display: flex; align-items: center; justify-content: space-between; }
.rc-title { font-size: 15px; font-weight: 800; color: var(--c-ink); }
.rc-tag { font-size: 10px !important; padding: 2px 8px !important; }
.rp-stats { margin-top: 12px; display: flex; gap: 8px; }
.rp-stat {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  background: #F7F8FA;
  border-radius: 10px;
  padding: 9px 4px;
}
.rp-num { font-size: 17px; font-weight: 900; color: var(--c-ink); }
.rp-k { margin-top: 2px; font-size: 9.5px; color: var(--c-mute); text-align: center; }
.rp-sec { margin-top: 14px; }
.rp-sec-t { font-size: 12px; font-weight: 700; color: var(--c-ink-soft); margin-bottom: 6px; }
.rp-trend-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; }
.rp-t-label { flex: 1; color: var(--c-ink-soft); }
.rp-t-from { color: var(--c-mute); }
.rp-t-arrow { color: #C7C7CC; }
.rp-t-to { font-weight: 800; color: var(--c-ink); }
.rp-t-delta.up { color: var(--c-mint); font-weight: 800; }
.rp-t-delta.down { color: var(--c-coral); font-weight: 800; }
.rp-err {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 0;
  font-size: 12px;
  border-bottom: 1px dashed #F0F0F3;
  flex-wrap: wrap;
}
.rp-err:last-child { border-bottom: none; }
.rp-err-point {
  font-size: 10px; font-weight: 700;
  background: var(--c-sky-mist); color: var(--c-klein-deep);
  border-radius: 999px; padding: 1px 8px;
}
.rp-err-count { color: var(--c-coral); font-weight: 800; }
.rp-err-fix { color: var(--c-ink-soft); }
.rp-ai {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--c-cream);
  border-radius: 10px;
  font-size: 12.5px; line-height: 1.7; color: var(--c-ink);
}
.rp-ai-tag {
  display: inline-block;
  font-size: 10px; font-weight: 800;
  background: var(--c-honey); color: #8A6D1A;
  border-radius: 999px; padding: 1px 8px;
  margin-right: 6px;
}
.rp-focus-row { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
.rp-focus {
  padding: 3px 10px;
  border-radius: 999px;
  background: #fff; border: 1px solid var(--c-border);
  font-size: 11.5px; color: var(--c-ink-soft);
}

/* ===== 底部操作 ===== */
.bottom-ops { display: flex; gap: 10px; margin: 18px 2px 0; }
.bottom-ops .btn-stick { flex: 1; }
.reset-btn {
  flex: 1;
  text-align: center;
  padding: 11px 0;
  border-radius: var(--radius-md);
  background: #fff;
  border: 1px solid #FFD1CD;
  color: var(--c-coral);
  font-size: 14px; font-weight: 600;
  cursor: pointer;
}
.reset-btn:active { transform: scale(0.97); background: #FFF3F2; }

/* ===== 留言卡 ===== */
.fb-card { padding: 16px; margin-top: 14px; }
.fb-head { display: flex; align-items: baseline; gap: 8px; }
.fb-title { font-size: 14px; font-weight: 800; color: var(--c-ink); }
.fb-sub { font-size: 10.5px; color: var(--c-mute); }
.fb-input {
  width: 100%;
  margin-top: 10px;
  min-height: 72px;
  border: 1.5px solid var(--c-border);
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}
.fb-input:focus { border-color: var(--c-klein); }
.fb-send {
  margin-top: 10px;
  text-align: center;
  padding: 10px 0;
  border-radius: 999px;
  background: var(--c-klein);
  color: #fff;
  font-size: 13.5px; font-weight: 700;
  cursor: pointer;
}
.fb-send:active { transform: scale(0.98); }
.fb-send-off { opacity: 0.5; }
.fb-actions { margin-top: 10px; display: flex; gap: 8px; }
.fb-btn {
  flex: 1;
  text-align: center;
  padding: 9px 0;
  border-radius: 999px;
  font-size: 12.5px; font-weight: 700;
  cursor: pointer;
}
.fb-btn-primary { background: var(--c-klein); color: #fff; }
.fb-btn-plain { background: var(--c-cream); color: var(--c-ink-soft); }
.fb-list { margin-top: 8px; }
.fb-item { padding: 10px 0; border-bottom: 1px solid #F0F0F3; }
.fb-item:last-child { border-bottom: none; }
.fb-meta { display: flex; align-items: baseline; gap: 8px; }
.fb-nick { font-size: 12px; font-weight: 700; color: var(--c-ink); }
.fb-time { font-size: 10px; color: var(--c-mute); }
.fb-content { display: block; margin-top: 4px; font-size: 12.5px; color: var(--c-ink-soft); line-height: 1.6; user-select: text; }
.fb-empty { padding: 16px 0; text-align: center; font-size: 12px; color: var(--c-mute); }

.version-line {
  margin-top: 20px;
  text-align: center;
  font-size: 11px;
  color: #B9BAC0;
  user-select: none;
  -webkit-user-select: none;
  cursor: default;
}
</style>
