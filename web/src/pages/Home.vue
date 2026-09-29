<script setup>
// 首页「오늘의 한국어」：今日训练入口 + 能力概览 + 学习闭环叙事
// 数据原则：只展示用户档案中的真实数据；暂无数据的维度一律显示「待评估」，不编造分数
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '../api/client';
import { currentUid, storeSet } from '../utils/storage';
import { showToast } from '../utils/ui';
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

// 五维能力：由后端评分引擎（/api/abilities）写入真实分数；无证据时 score 为 null → 待评估
const DIMS = [
  { key: 'vocabulary', label: '词汇', icon: '📒', score: null, hasScore: false },
  { key: 'grammar', label: '语法', icon: '📚', score: null, hasScore: false },
  { key: 'pronunciation', label: '发音', icon: '🎤', score: null, hasScore: false },
  { key: 'fluency', label: '流畅度', icon: '💬', score: null, hasScore: false },
  { key: 'naturalness', label: '自然度', icon: '✨', score: null, hasScore: false }
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

/* 能力画像：分数只来自后端数据驱动引擎，null → 待评估 */
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

/* 开始今日训练：进入对话页并自动预填训练指令（chat 页读取 kfp_chat_prefill 联动） */
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

/* 演示模式入口：写入一次性进入标志，chat 页在挂载/激活时双路接管 */
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
</script>

<template>
  <div class="page page-tab">
    <!-- ===== 顶部：品牌 + 等级 ===== -->
    <div class="hero">
      <div class="hero-left">
        <div class="hero-title">오늘의 한국어</div>
        <div class="hero-sub">{{ dateLabel }} · AI 教练 Han 陪练中</div>
      </div>
      <div class="hero-level" @click="router.push('/profile')">
        <div class="hl-badge" :class="{ 'hl-on': data.level }">
          <span class="hl-ko">{{ data.level || '未定级' }}</span>
        </div>
        <div class="hl-cap">{{ data.level ? 'TOPIK 等级' : '完成测试解锁' }}</div>
      </div>
      <div class="hero-mark">한국어</div>
    </div>

    <!-- ===== AI 教练状态 ===== -->
    <div v-if="!data.loading" class="coach-signal">
      <div class="signal-orbit"><div class="signal-core"></div><div class="signal-ring signal-ring-a"></div><div class="signal-ring signal-ring-b"></div></div>
      <div class="signal-copy">
        <div class="signal-eyebrow">AI COACH · {{ data.goalDisplay || 'PERSONALIZED' }}</div>
        <div class="signal-title">{{ data.coachHeadline }}</div>
        <div class="signal-sub">{{ data.coachSubline }}</div>
      </div>
      <div class="signal-live">LIVE</div>
    </div>

    <!-- ===== 加载骨架 / 失败重试 ===== -->
    <template v-if="data.loading">
      <div class="card skeleton-card">
        <div class="sk-line sk-line-lg"></div>
        <div class="sk-line"></div>
        <div class="sk-line sk-line-sm"></div>
      </div>
      <div class="card skeleton-card">
        <div class="sk-line"></div>
        <div class="sk-line sk-line-sm"></div>
      </div>
    </template>

    <div v-else-if="data.loadFailed" class="card error-card">
      <div class="err-emoji">🛰️</div>
      <div class="err-text">连接不到学习服务器</div>
      <div class="err-sub">请确认后端已启动，或稍后再试</div>
      <div class="btn-ghost" @click="onRetry">重新连接</div>
    </div>

    <template v-else>
      <!-- ===== 今日 AI 训练（核心卡） ===== -->
      <div class="card today-card">
        <div class="card-head">
          <div class="ch-title">
            <span class="dot-row"><span class="dot dot-blue"></span><span class="dot dot-red"></span><span class="dot dot-ink"></span></span>
            <span class="ch-name">今日 AI 训练</span>
          </div>
          <span class="ch-tag">AI 定制</span>
        </div>

        <div class="today-focus">
          <div class="focus-kicker">{{ data.focusLabel }}</div>
          <div class="focus-value">{{ data.focusValue }}</div>
          <div class="focus-note">{{ data.progressHint }}</div>
        </div>

        <div class="goal-list">
          <div v-if="data.streakDays > 0" class="goal-row">
            <span class="goal-ico">🔥</span>
            <span class="goal-k">连续学习</span>
            <span class="goal-v">{{ data.streakDays }} 天</span>
          </div>
          <div v-if="data.weekMinutes > 0" class="goal-row">
            <span class="goal-ico">⏱️</span>
            <span class="goal-k">本周练习</span>
            <span class="goal-v">{{ data.weekMinutes }} 分钟</span>
          </div>
          <div class="goal-row">
            <span class="goal-ico">🎤</span>
            <span class="goal-k">口语练习</span>
            <span class="goal-v">目标 15 分钟</span>
          </div>
          <div class="goal-row">
            <span class="goal-ico">📖</span>
            <span class="goal-k">重点语法</span>
            <span class="goal-v" :class="{ 'goal-v-pending': !data.weakPoints.length }">{{ data.weakPoints[0] || '对话后自动生成' }}</span>
          </div>
          <div v-if="data.weakPoints.length > 1" class="goal-row">
            <span class="goal-ico">🧠</span>
            <span class="goal-k">薄弱点</span>
            <span class="goal-v">{{ data.weakPoints[1] }}</span>
          </div>
          <div v-if="data.dueVocab > 0" class="goal-row">
            <span class="goal-ico">🔁</span>
            <span class="goal-k">到期复习</span>
            <span class="goal-v">{{ data.dueVocab }} 个生词</span>
          </div>
        </div>

        <div class="start-btn" @click="onStartToday">
          <span>시작 开始今日训练</span>
          <span class="start-arrow">→</span>
        </div>
      </div>

      <!-- ===== 我的韩语能力 ===== -->
      <div class="card ability-card">
        <div class="card-head">
          <div class="ch-title"><span class="ch-name">我的韩语能力</span></div>
          <span class="ch-tag ch-tag-plain">数据驱动 · 不虚构</span>
        </div>
        <div class="ability-caption">每个分数都来自真实对话、纠错或跟读记录</div>

        <div class="ability-overall">
          <div class="ao-main">
            <span class="ao-num">{{ data.overall == null ? '—' : data.overall }}</span>
            <span v-if="data.overall != null" class="ao-unit">/ 100</span>
          </div>
          <div class="ao-side">
            <div class="ao-t1">{{ data.overall != null ? '综合评分' : '综合评分 · 待评估' }}</div>
            <div class="ao-t2">{{ data.overall == null ? '完成测试与训练后解锁' : (data.overallBasis || '') }}</div>
          </div>
        </div>

        <div class="dims">
          <div v-for="d in data.dims" :key="d.key" class="dim-row">
            <span class="dim-ico">{{ d.icon }}</span>
            <span class="dim-label">{{ d.label }}</span>
            <div class="dim-val" :class="d.hasScore ? 'dim-on' : 'pending'">
              <span v-if="d.hasScore">{{ d.score }}<span class="dim-unit"> / 100</span></span>
              <span v-else>待评估</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 学习闭环叙事 ===== -->
      <div class="card loop-card">
        <div class="loop-title">AI 不陪你聊天，AI 陪你成长</div>
        <div class="loop-row">
          <div class="loop-step"><div class="loop-ico">🔍</div><div class="loop-t">测试</div><div class="loop-s">发现水平</div></div>
          <div class="loop-arrow">→</div>
          <div class="loop-step"><div class="loop-ico">🧠</div><div class="loop-t">分析</div><div class="loop-s">定位薄弱点</div></div>
          <div class="loop-arrow">→</div>
          <div class="loop-step"><div class="loop-ico">🎯</div><div class="loop-t">训练</div><div class="loop-s">记忆错误</div></div>
          <div class="loop-arrow">→</div>
          <div class="loop-step"><div class="loop-ico">📈</div><div class="loop-t">进步</div><div class="loop-s">能力可视</div></div>
        </div>
      </div>

      <!-- ===== 最近纠错（有数据才显示） ===== -->
      <div v-if="data.recentErrors.length" class="card">
        <div class="card-head">
          <div class="ch-title"><span class="ch-name">最近一次纠正</span></div>
          <span class="ch-tag ch-tag-plain">自动记忆</span>
        </div>
        <div class="fix-row">
          <span class="fix-wrong">{{ data.recentErrors[0].wrong || '' }}</span>
          <span class="fix-arrow">→</span>
          <span class="fix-right">{{ data.recentErrors[0].right || '' }}</span>
        </div>
        <div class="fix-note">{{ data.recentErrors[0].note || '' }}</div>
      </div>
    </template>

    <!-- ===== 演示模式入口（预置剧本，无需 LLM；后端不可达时点击会得到明确提示） ===== -->
    <div v-if="!data.loading" class="demo-entry" @click="onDemoEntry">
      <span class="de-ico">🗂️</span>
      <div class="de-txt">
        <div class="de-t1">演示模式</div>
        <div class="de-t2">3 分钟预置剧本 · 无需 AI 接口 · 数据与真实档案隔离</div>
      </div>
      <span class="de-arrow">→</span>
    </div>

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
.page { padding: 12px 16px calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px); }

/* ===== 顶部品牌区 ===== */
.hero {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin: 4px 4px 18px;
  overflow: hidden;
}
.hero-left { flex: 1; min-width: 0; }
.hero-title { font-size: 30px; font-weight: 800; letter-spacing: 0.5px; color: var(--c-ink); line-height: 1.2; }
.hero-sub { margin-top: 7px; font-size: 12px; color: var(--c-mute); }
.hero-level { display: flex; flex-direction: column; align-items: center; margin-left: 12px; padding-top: 3px; flex: none; cursor: pointer; }
.hl-badge {
  width: 50px; height: 50px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed #C7C7CC;
  background: #FFFFFF;
}
.hl-badge.hl-on { border: none; background: var(--c-sky-mist); box-shadow: var(--shadow-soft); }
.hl-ko { font-size: 13px; font-weight: 700; color: var(--c-ink-soft); }
.hl-on .hl-ko { color: var(--c-klein-deep); }
.hl-cap { margin-top: 5px; font-size: 10px; color: var(--c-mute); }
.hero-mark {
  position: absolute; right: -6px; bottom: -23px;
  font-size: 65px; font-weight: 800;
  color: rgba(0, 113, 227, 0.05);
  pointer-events: none; z-index: 0;
}

/* ===== AI 教练状态带 ===== */
.coach-signal {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 13px;
  margin: -5px 0 14px;
  background: #17243B;
  border-radius: var(--radius-lg);
  overflow: hidden;
  color: #F8FAFF;
}
.coach-signal::after {
  content: "";
  position: absolute; right: -40px; top: -60px;
  width: 140px; height: 140px;
  border: 1px solid rgba(118, 178, 255, 0.28);
  border-radius: 50%;
  transform: rotate(18deg);
}
.signal-orbit { position: relative; width: 36px; height: 36px; flex: none; }
.signal-core { position: absolute; left: 13px; top: 13px; width: 9px; height: 9px; border-radius: 50%; background: #F0C36A; box-shadow: 0 0 0 4px rgba(240,195,106,0.13); }
.signal-ring { position: absolute; left: 4px; top: 4px; width: 28px; height: 28px; border: 1px solid rgba(119, 189, 255, 0.55); border-radius: 50%; }
.signal-ring-a { animation: signal-breathe 2.4s ease-out infinite; }
.signal-ring-b { left: 9px; top: 9px; width: 18px; height: 18px; border-color: rgba(240,195,106,0.42); animation: signal-breathe 2.4s ease-out 0.7s infinite; }
@keyframes signal-breathe { 0%, 100% { transform: scale(0.82); opacity: 0.45; } 50% { transform: scale(1.12); opacity: 1; } }
.signal-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
.signal-eyebrow { font-size: 9px; letter-spacing: 1px; color: #9CB9DB; }
.signal-title { margin-top: 3px; font-size: 14px; line-height: 1.35; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.signal-sub { margin-top: 2px; font-size: 10.5px; line-height: 1.4; color: #B6C5D8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.signal-live { position: relative; z-index: 1; padding: 2px 5px; border: 1px solid rgba(240,195,106,0.55); border-radius: 999px; color: #F0C36A; font-size: 8.5px; font-weight: 800; letter-spacing: 0.5px; }

/* ===== 卡片 ===== */
.card {
  background: var(--c-card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-soft);
  padding: 20px;
  margin-bottom: 16px;
  animation: rise 0.35s ease-out both;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.ch-title { display: flex; align-items: center; }
.ch-name { font-size: 15px; font-weight: 700; color: var(--c-ink); }
.ch-tag {
  font-size: 10px; font-weight: 600; color: var(--c-klein-deep);
  background: var(--c-sky-mist); border-radius: var(--radius-pill); padding: 3px 9px;
}
.ch-tag-plain { background: #F2F2F7; color: var(--c-mute); }

.dot-row { display: flex; align-items: center; margin-right: 8px; }
.dot { width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; }
.dot-blue { background: #0071E3; }
.dot-red { background: #D64541; }
.dot-ink { background: #1D1D1F; }

/* ===== 今日训练卡 ===== */
.today-focus {
  margin-top: 11px; padding: 12px 13px;
  border-left: 3px solid #D6A51F;
  background: linear-gradient(90deg, #FFF8E8, #FFFCF4);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
.focus-kicker { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; color: #8A5B00; }
.focus-value { margin-top: 4px; font-size: 17px; line-height: 1.25; font-weight: 900; color: var(--c-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.focus-note { margin-top: 3px; font-size: 10.5px; color: var(--c-mute); }
.goal-list { margin-top: 10px; }
.goal-row { display: flex; align-items: center; padding: 11px 0; border-bottom: 1px solid #F0F0F3; }
.goal-row:last-child { border-bottom: none; }
.goal-ico { font-size: 16px; margin-right: 11px; flex: none; }
.goal-k { font-size: 13px; color: var(--c-mute); width: 75px; flex: none; }
.goal-v { flex: 1; text-align: right; font-size: 14px; font-weight: 600; color: var(--c-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.goal-v-pending { color: var(--c-mute); font-weight: 400; }

.start-btn {
  margin-top: 18px;
  height: 48px;
  border-radius: var(--radius-pill);
  background: #1D1D1F;
  color: #FFFFFF;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600;
  box-shadow: var(--shadow-lift);
  transition: transform 0.18s ease-out, opacity 0.18s ease-out;
  cursor: pointer;
}
.start-btn:active { transform: scale(0.98); opacity: 0.92; }
.start-arrow { margin-left: 8px; font-size: 16px; }

/* ===== 能力卡 ===== */
.ability-caption { margin-top: 1px; font-size: 10.5px; color: var(--c-mute); }
.ability-overall {
  display: flex; align-items: center;
  background: #F7F8FA; border-radius: var(--radius-lg);
  padding: 16px; margin-top: 11px;
}
.ao-main { display: flex; align-items: baseline; flex: none; }
.ao-num { font-size: 36px; font-weight: 800; color: var(--c-ink); line-height: 1; }
.ao-unit { font-size: 12px; color: var(--c-mute); margin-left: 4px; }
.ao-side { margin-left: 16px; }
.ao-t1 { font-size: 15px; font-weight: 600; color: var(--c-ink); }
.ao-t2 { margin-top: 4px; font-size: 11px; color: var(--c-mute); }

.dims { margin-top: 10px; }
.dim-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #F0F0F3; }
.dim-row:last-child { border-bottom: none; }
.dim-ico { font-size: 16px; margin-right: 11px; }
.dim-label { font-size: 14px; color: var(--c-ink); width: 75px; }
.dim-val { flex: 1; text-align: right; font-size: 14px; font-weight: 600; color: var(--c-ink); }
.dim-val.pending { color: var(--c-mute); font-weight: 400; font-size: 13px; }
.dim-val.dim-on { color: var(--c-klein-deep); font-size: 16px; }
.dim-unit { font-size: 11px; color: var(--c-mute); font-weight: 400; }

/* ===== 学习闭环叙事 ===== */
.loop-title { text-align: center; font-size: 14px; font-weight: 700; color: var(--c-ink); margin-bottom: 18px; }
.loop-row { display: flex; align-items: flex-start; justify-content: space-between; }
.loop-step { display: flex; flex-direction: column; align-items: center; flex: 1; }
.loop-ico { font-size: 26px; }
.loop-t { margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--c-ink); }
.loop-s { margin-top: 2px; font-size: 10px; color: var(--c-mute); }
.loop-arrow { color: #C7C7CC; font-size: 14px; padding-top: 13px; flex: none; }

/* ===== 最近纠错 ===== */
.fix-row { display: flex; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.fix-wrong { font-size: 16px; font-weight: 700; color: var(--c-coral); text-decoration: line-through; }
.fix-arrow { margin: 0 12px; color: var(--c-mute); font-size: 14px; }
.fix-right { font-size: 16px; font-weight: 700; color: var(--c-mint); }
.fix-note { margin-top: 8px; font-size: 12px; color: var(--c-mute); }

/* ===== 加载骨架 / 失败态 ===== */
.error-card { display: flex; flex-direction: column; align-items: center; padding: 32px 20px; }
.err-emoji { font-size: 36px; }
.err-text { margin-top: 10px; font-size: 15px; font-weight: 600; color: var(--c-ink); }
.err-sub { margin: 6px 0 18px; font-size: 12px; color: var(--c-mute); }

/* ===== 演示模式入口 ===== */
.demo-entry {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  margin: 0 2px 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px dashed rgba(14, 24, 54, 0.18);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease-out;
  cursor: pointer;
}
.demo-entry:active { transform: scale(0.98); background: var(--c-sky-soft); }
.de-ico { font-size: 17px; flex-shrink: 0; }
.de-txt { flex: 1; min-width: 0; }
.de-t1 { font-size: 13px; font-weight: 700; color: var(--c-ink); }
.de-t2 { margin-top: 2px; font-size: 11px; color: var(--c-mute); }
.de-arrow { font-size: 15px; color: var(--c-mute); flex-shrink: 0; }
</style>
