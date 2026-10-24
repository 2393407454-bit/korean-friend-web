<script setup>
// 首页「오늘의 한국어」：今日训练入口 + 能力概览 + 学习闭环叙事
// 数据原则：只展示用户档案中的真实数据；暂无数据的维度一律显示「待评估」，不编造分数
import { onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '../api/client';
import { currentUid, storeSet } from '../utils/storage';
import ConfirmModal from '../components/ConfirmModal.vue';

const router = useRouter();

const GOAL_TEXT = {
  kpop: '追星',
  kdrama: '韩剧',
  study: '留学',
  work: '工作',
  travel: '旅行',
  hobby: '兴趣'
};

const DIMS = [
  { key: 'vocabulary', label: '词汇', score: null, hasScore: false },
  { key: 'grammar', label: '语法', score: null, hasScore: false },
  { key: 'pronunciation', label: '发音', score: null, hasScore: false },
  { key: 'fluency', label: '流畅度', score: null, hasScore: false },
  { key: 'naturalness', label: '自然度', score: null, hasScore: false }
];

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const now = new Date();
const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 · 周${WEEK_CN[now.getDay()]}`;

const data = reactive({
  level: '',
  goalDisplay: '',
  dims: DIMS.map((d) => ({ ...d })),
  overall: null,
  overallBasis: '',
  streakDays: 0,
  weekMinutes: 0,
  weakPoints: [],
  dueVocab: 0,
  recentErrors: [],
  coachHeadline: '先完成一次短练习，AI 才能真正认识你',
  coachSubline: '每一次回答都会成为下一次训练的依据',
  focusLabel: '今日重点',
  focusValue: '完成 2 轮对话后生成',
  progressHint: '尚未形成能力基线',
  loading: true,
  loadFailed: false
});

const demoVisible = ref(false);

function load() {
  get('/api/profile/' + currentUid()).then((res) => {
    if (!res) return;
    const progress = res.progress || {};
    const profile = res.profile || {};
    const ts = Date.now();
    const dueVocab = (progress.vocab || []).filter(
      (v) => v.due_at && new Date(v.due_at).getTime() <= ts
    ).length;
    const weakPoints = (progress.weak_points || []).slice(0, 3);
    const recentErrors = (progress.error_log || []).slice(-2).reverse();
    Object.assign(data, {
      level: profile.level || '',
      goalDisplay: profile.goal ? GOAL_TEXT[profile.goal] || '' : '',
      weakPoints,
      dueVocab,
      recentErrors,
      coachHeadline: weakPoints.length ? '今天先把「' + weakPoints[0] + '」练顺' : (profile.level ? '继续保持，今天让表达更自然' : '先完成一次短练习，AI 才能真正认识你'),
      coachSubline: weakPoints.length ? 'AI 会把这个薄弱点带进下一轮对话' : '每一次回答都会成为下一次训练的依据',
      focusLabel: weakPoints.length ? 'AI 发现的薄弱点' : (dueVocab ? '到期复习' : '今日重点'),
      focusValue: weakPoints.length ? weakPoints[0] : (dueVocab ? dueVocab + ' 个词等你复习' : '完成 2 轮对话后生成'),
      progressHint: profile.level ? '已建立部分能力证据' : '尚未形成能力基线',
      loading: false,
      loadFailed: false
    });
    loadAbilities();
  }).catch(() => {
    data.loading = false;
    data.loadFailed = true;
  });
}

function loadAbilities() {
  get('/api/abilities/' + currentUid()).then((res) => {
    if (!res || !res.dims) return;
    const byKey = {};
    res.dims.forEach((d) => (byKey[d.key] = d));
    data.dims = data.dims.map((d) => {
      const s = byKey[d.key] && byKey[d.key].score;
      return { ...d, score: s == null ? null : s, hasScore: s != null };
    });
    const overall = res.overall == null ? null : res.overall;
    const stats = res.stats || {};
    data.overall = overall;
    data.overallBasis = res.overallBasis || '';
    data.progressHint = overall == null ? data.progressHint : ((stats.week_turns || 0) + ' 轮真实对话形成的能力证据');
    data.streakDays = stats.streak_days || 0;
    data.weekMinutes = stats.week_minutes_est || 0;
  }).catch(() => {});
}

function onStartToday() {
  const wp = data.weakPoints;
  const prefill = wp.length
    ? '오늘의 훈련 시작! 请先用 2 个问题帮我热身，再围绕我的薄弱点「' + wp.slice(0, 2).join('、') + '」安排几轮口语练习'
    : '오늘의 훈련 시작! 先简单测试一下我的韩语水平，再安排今天的口语练习吧';
  storeSet('kfp_chat_prefill', prefill);
  router.push('/chat');
}

function onRetry() {
  data.loading = true;
  data.loadFailed = false;
  load();
}

function onDemoEntry() {
  demoVisible.value = true;
}

function onDemoConfirm() {
  demoVisible.value = false;
  storeSet('kfp_demo_mode', '1');
  storeSet('kfp_demo_enter', '1');
  router.push('/chat');
}

load();

// 首页被 keep-alive 缓存后，每次从其他 tab 切回时静默刷新一次：
// load() 不在开始时切换 loading，已有内容保持展示、不闪骨架，数据回来后原地更新
onActivated(load);
</script>

<template>
  <div class="page page-tab">
    <!-- ===== 顶部：品牌 + 等级 ===== -->
    <header class="hero rise rise-1">
      <div class="hero-left">
        <div class="h-page hero-title">오늘의 한국어</div>
        <div class="hero-sub">{{ dateLabel }} · AI 教练 Han 陪练中</div>
      </div>
      <button class="hero-level" @click="router.push('/profile')">
        <span class="hl-badge" :class="{ 'hl-on': data.level }">{{ data.level || '未定级' }}</span>
        <span class="hl-cap">{{ data.level ? 'TOPIK 等级' : '完成测试解锁' }}</span>
      </button>
    </header>

    <!-- ===== AI 教练状态带 ===== -->
    <section v-if="!data.loading" class="coach rise rise-1">
      <span class="coach-dot"></span>
      <div class="coach-copy">
        <div class="coach-eyebrow">AI COACH · {{ data.goalDisplay || 'PERSONALIZED' }}</div>
        <div class="coach-title">{{ data.coachHeadline }}</div>
        <div class="coach-sub">{{ data.coachSubline }}</div>
      </div>
      <span class="coach-live">LIVE</span>
    </section>

    <!-- ===== 加载骨架 / 失败重试 ===== -->
    <template v-if="data.loading">
      <div class="card">
        <div class="sk-line sk-line-lg"></div>
        <div class="sk-line"></div>
        <div class="sk-line sk-line-sm"></div>
      </div>
      <div class="card">
        <div class="sk-line"></div>
        <div class="sk-line sk-line-sm"></div>
      </div>
    </template>

    <div v-else-if="data.loadFailed" class="card error-card">
      <div class="err-text">连接不到学习服务器</div>
      <div class="cap" style="margin: 6px 0 16px;">请确认后端已启动，或稍后再试</div>
      <button class="btn btn-ghost btn-pill" @click="onRetry">重新连接</button>
    </div>

    <template v-else>
      <!-- ===== 今日 AI 训练 ===== -->
      <section class="card rise rise-2">
        <div class="card-head">
          <span class="h-sec">今日 AI 训练</span>
          <span class="tag tag-accent">AI 定制</span>
        </div>

        <div class="focus">
          <div class="focus-kicker">{{ data.focusLabel }}</div>
          <div class="focus-value">{{ data.focusValue }}</div>
          <div class="cap">{{ data.progressHint }}</div>
        </div>

        <div class="rows">
          <div v-if="data.streakDays > 0" class="row">
            <span class="row-k">连续学习</span>
            <span class="row-v num">{{ data.streakDays }} 天</span>
          </div>
          <div v-if="data.weekMinutes > 0" class="row">
            <span class="row-k">本周练习</span>
            <span class="row-v num">{{ data.weekMinutes }} 分钟</span>
          </div>
          <div class="row">
            <span class="row-k">口语练习</span>
            <span class="row-v">目标 15 分钟</span>
          </div>
          <div class="row">
            <span class="row-k">重点语法</span>
            <span class="row-v" :class="{ 'is-pending': !data.weakPoints.length }">{{ data.weakPoints[0] || '对话后自动生成' }}</span>
          </div>
          <div v-if="data.weakPoints.length > 1" class="row">
            <span class="row-k">薄弱点</span>
            <span class="row-v">{{ data.weakPoints[1] }}</span>
          </div>
          <div v-if="data.dueVocab > 0" class="row">
            <span class="row-k">到期复习</span>
            <span class="row-v num">{{ data.dueVocab }} 个生词</span>
          </div>
        </div>

        <button class="start-btn" @click="onStartToday">
          시작 · 开始今日训练
          <span class="start-arrow">→</span>
        </button>
      </section>

      <!-- ===== 我的韩语能力 ===== -->
      <section class="card rise rise-3">
        <div class="card-head">
          <span class="h-sec">我的韩语能力</span>
          <span class="tag">数据驱动 · 不虚构</span>
        </div>
        <div class="cap" style="margin-top: 2px;">每个分数都来自真实对话、纠错或跟读记录</div>

        <div class="overall">
          <div class="overall-num num">{{ data.overall == null ? '—' : data.overall }}<span v-if="data.overall != null" class="overall-unit">/100</span></div>
          <div class="overall-side">
            <div class="overall-t">{{ data.overall != null ? '综合评分' : '综合评分 · 待评估' }}</div>
            <div class="cap">{{ data.overall == null ? '完成测试与训练后解锁' : (data.overallBasis || '') }}</div>
          </div>
        </div>

        <div class="rows">
          <div v-for="d in data.dims" :key="d.key" class="row">
            <span class="row-k">{{ d.label }}</span>
            <span v-if="d.hasScore" class="row-v dim-on num">{{ d.score }}<span class="dim-unit"> /100</span></span>
            <span v-else class="row-v is-pending">待评估</span>
          </div>
        </div>
      </section>

      <!-- ===== 学习闭环 ===== -->
      <section class="card rise rise-3">
        <div class="loop-title">AI 不陪你聊天，AI 陪你成长</div>
        <div class="loop-row">
          <div class="loop-step"><span class="loop-t">测试</span><span class="cap">发现水平</span></div>
          <span class="loop-arrow">→</span>
          <div class="loop-step"><span class="loop-t">分析</span><span class="cap">定位薄弱点</span></div>
          <span class="loop-arrow">→</span>
          <div class="loop-step"><span class="loop-t">训练</span><span class="cap">记忆错误</span></div>
          <span class="loop-arrow">→</span>
          <div class="loop-step"><span class="loop-t">进步</span><span class="cap">能力可视</span></div>
        </div>
      </section>

      <!-- ===== 最近纠错 ===== -->
      <section v-if="data.recentErrors.length" class="card rise rise-4">
        <div class="card-head">
          <span class="h-sec">最近一次纠正</span>
          <span class="tag">自动记忆</span>
        </div>
        <div class="fix-row">
          <span class="fix-wrong">{{ data.recentErrors[0].wrong || '' }}</span>
          <span class="fix-arrow">→</span>
          <span class="fix-right">{{ data.recentErrors[0].right || '' }}</span>
        </div>
        <div v-if="data.recentErrors[0].note" class="cap" style="margin-top: 6px;">{{ data.recentErrors[0].note }}</div>
      </section>
    </template>

    <!-- ===== 演示模式入口 ===== -->
    <button v-if="!data.loading" class="demo-entry rise rise-4" @click="onDemoEntry">
      <span class="de-txt">
        <span class="de-t1">演示模式</span>
        <span class="de-t2">3 分钟预置剧本 · 无需 AI 接口 · 数据与真实档案隔离</span>
      </span>
      <span class="de-arrow">→</span>
    </button>

    <ConfirmModal
      :visible="demoVisible"
      title="进入演示模式"
      content="使用预置剧本在 3 分钟内完整体验：测试 → 定级 → 纠错 → 错误记忆 → 掌握 → 情景复盘。\n演示数据与你的真实学习档案完全隔离。"
      ok-text="开始演示"
      danger
      @confirm="onDemoConfirm"
      @close="demoVisible = false"
    />
  </div>
</template>

<style scoped>
.page { padding: 20px 16px calc(var(--tabbar-h) + var(--floatbar-offset) + env(safe-area-inset-bottom) + 16px); }

/* ===== 顶部 ===== */
.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin: 0 0 18px;
}
.hero-title {
  background: linear-gradient(135deg, var(--ink) 0%, var(--ink-2) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero-sub { margin-top: 6px; font-size: 12px; color: var(--ink-3); }
.hero-level {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  flex: none;
  transition: transform 0.2s ease;
}
.hero-level:active { transform: scale(0.94); }
.hl-badge {
  min-width: 54px;
  height: 54px;
  padding: 0 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-3);
  border: 1px dashed var(--line-2);
  background: var(--surface);
  transition: all 0.25s ease;
}
.hl-badge.hl-on {
  border: none;
  background: linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--accent-soft) 60%, var(--surface)));
  color: var(--accent-deep);
  box-shadow: 0 4px 14px rgba(11, 107, 232, 0.14);
}
.hl-cap { font-size: 10px; color: var(--ink-3); }

/* ===== 教练状态带 ===== */
.coach {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, var(--ink) 0%, #1C1E25 100%);
  border-radius: var(--radius-l);
  color: #F8F8F6;
  position: relative;
  overflow: hidden;
}
.coach::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
}
.coach-dot {
  flex: none;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #6FB5FF;
  animation: breathe 2.2s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 3px rgba(111, 181, 255, .18); }
  50% { opacity: .55; box-shadow: 0 0 0 6px rgba(111, 181, 255, 0); }
}
.coach-copy { flex: 1; min-width: 0; }
.coach-eyebrow { font-size: 10px; letter-spacing: .12em; color: #9BA3AF; }
.coach-title { margin-top: 3px; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.coach-sub { margin-top: 2px; font-size: 11px; color: #B9BFC8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.coach-live {
  flex: none;
  padding: 2px 8px;
  border: 1px solid rgba(255, 255, 255, .28);
  border-radius: var(--radius-pill);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .1em;
  color: #CFD6DE;
}

/* ===== 卡片头部 ===== */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

/* ===== 今日重点 ===== */
.focus {
  margin: 12px 0 4px;
  padding: 14px 16px;
  border-left: 3px solid var(--accent);
  background: linear-gradient(90deg, var(--accent-soft) 0%, var(--surface-2) 100%);
  border-radius: 0 var(--radius-m) var(--radius-m) 0;
}
.focus-kicker { font-size: 10px; font-weight: 800; letter-spacing: .1em; color: var(--ink-3); }
.focus-value { margin: 4px 0 2px; font-size: 17px; font-weight: 800; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ===== 数据行 ===== */
.rows { margin-top: 8px; }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
}
.row:last-child { border-bottom: none; }
.row-k { font-size: 13px; color: var(--ink-2); }
.row-v { font-size: 14px; font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
.row-v.is-pending { color: var(--ink-3); font-weight: 400; }
.dim-on { color: var(--accent-deep); }
.dim-unit { font-size: 11px; color: var(--ink-3); font-weight: 400; }

/* ===== 主按钮 ===== */
.start-btn {
  width: 100%;
  margin-top: 16px;
  height: 48px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: transform .18s cubic-bezier(0.22, 0.61, 0.36, 1), opacity .18s ease, box-shadow .2s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.start-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}
.start-btn:active { transform: scale(0.97); opacity: .92; }
.start-btn:hover::after { transform: translateX(100%); }
.start-arrow { transition: transform .2s ease; }
.start-btn:hover .start-arrow,
.start-btn:active .start-arrow { transform: translateX(4px); }
@media (hover: hover) {
  .start-btn:hover { box-shadow: 0 8px 24px rgba(20, 21, 25, 0.18); }
}

/* ===== 综合评分 ===== */
.overall {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, var(--surface-2) 0%, color-mix(in srgb, var(--surface-2) 70%, var(--surface)) 100%);
  border-radius: var(--radius-m);
  padding: 14px 16px;
  margin: 12px 0 4px;
}
.overall-num { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.overall-unit { font-size: 12px; font-weight: 600; color: var(--ink-3); margin-left: 5px; }
.overall-side { margin-left: 14px; min-width: 0; }
.overall-t { font-size: 14px; font-weight: 600; }

/* ===== 学习闭环 ===== */
.loop-title { text-align: center; font-size: 13px; font-weight: 600; color: var(--ink-2); margin-bottom: 16px; }
.loop-row { display: flex; align-items: flex-start; justify-content: space-between; }
.loop-step { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; }
.loop-t { font-size: 13px; font-weight: 700; }
.loop-arrow { color: var(--line-2); font-size: 13px; padding-top: 12px; flex: none; }

/* ===== 纠错 ===== */
.fix-row { display: flex; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.fix-wrong { font-size: 16px; font-weight: 700; color: var(--danger); text-decoration: line-through; }
.fix-arrow { margin: 0 10px; color: var(--ink-3); }
.fix-right { font-size: 16px; font-weight: 700; color: var(--ok); }

/* ===== 失败态 ===== */
.error-card { display: flex; flex-direction: column; align-items: center; padding: 36px 20px; }
.err-text { font-size: 15px; font-weight: 600; }

/* ===== 演示入口 ===== */
.demo-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 16px;
  margin-top: 14px;
  background: transparent;
  border: 1px dashed var(--line-2);
  border-radius: var(--radius-l);
  cursor: pointer;
  text-align: left;
  transition: background .18s ease, border-color .18s ease;
}
.demo-entry:active { background: var(--surface-2); }
@media (hover: hover) {
  .demo-entry:hover { border-color: var(--line-2); background: var(--surface-2); }
}
.de-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.de-t1 { font-size: 13px; font-weight: 700; color: var(--ink); }
.de-t2 { font-size: 11px; color: var(--ink-3); }
.de-arrow { color: var(--ink-3); flex-shrink: 0; }
</style>
