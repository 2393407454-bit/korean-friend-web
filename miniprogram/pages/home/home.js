// 首页「오늘의 한국어」：今日训练入口 + 能力概览 + 学习闭环叙事
// 数据原则：只展示用户档案中的真实数据；暂无数据的维度一律显示「待评估」，不编造分数
const api = require('../../utils/api');
const app = getApp();

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

function todayLabel() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEK_CN[d.getDay()]}`;
}

Page({
  data: {
    dateLabel: todayLabel(),
    level: '',
    goalDisplay: '',
    dims: DIMS,
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
  },

  onShow() {
    api.whenReady().then(() => this.load());
  },

  load() {
    api.get('/api/profile/' + app.globalData.userId).then((res) => {
      if (!res) return;
      const progress = res.progress || {};
      const profile = res.profile || {};
      const now = Date.now();
      const dueVocab = (progress.vocab || []).filter(
        (v) => v.due_at && new Date(v.due_at).getTime() <= now
      ).length;
      const weakPoints = (progress.weak_points || []).slice(0, 3);
      const recentErrors = (progress.error_log || []).slice(-2).reverse();
      this.setData({
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
      this.loadAbilities();
    }).catch(() => this.setData({ loading: false, loadFailed: true }));
  },

  /* 能力画像：分数只来自后端数据驱动引擎，null → 待评估 */
  loadAbilities() {
    api.get('/api/abilities/' + app.globalData.userId).then((res) => {
      if (!res || !res.dims) return;
      const byKey = {};
      res.dims.forEach((d) => (byKey[d.key] = d));
      const dims = this.data.dims.map((d) => {
        const s = byKey[d.key] && byKey[d.key].score;
        return { ...d, score: s == null ? null : s, hasScore: s != null };
      });
      const overall = res.overall == null ? null : res.overall;
      const stats = res.stats || {};
      this.setData({
        dims,
        overall,
        overallBasis: res.overallBasis || '',
        progressHint: overall == null ? this.data.progressHint : ((stats.week_turns || 0) + ' 轮真实对话形成的能力证据'),
        streakDays: stats.streak_days || 0,
        weekMinutes: stats.week_minutes_est || 0
      });
    }).catch(() => {});
  },

  /* 开始今日训练：进入对话页并自动预填训练指令（chat 页已有 kfp_chat_prefill 联动机制） */
  onStartToday() {
    const wp = this.data.weakPoints;
    const prefill = wp.length
      ? '오늘의 훈련 시작! 请先用 2 个问题帮我热身，再围绕我的薄弱点「' + wp.slice(0, 2).join('、') + '」安排几轮口语练习'
      : '오늘의 훈련 시작! 先简单测试一下我的韩语水平，再安排今天的口语练习吧';
    wx.setStorageSync('kfp_chat_prefill', prefill);
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  onRetry() {
    this.setData({ loading: true, loadFailed: false });
    this.load();
  },

  onGoBadge() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  /* 演示模式入口：写入一次性进入标志，chat 页在 onLoad/onShow 双路接管 */
  onDemoEntry() {
    wx.showModal({
      title: '进入演示模式',
      content: '使用预置剧本在 3 分钟内完整体验：测试 → 定级 → 纠错 → 错误记忆 → 掌握 → 情景复盘。\n演示数据与你的真实学习档案完全隔离。',
      confirmText: '开始演示',
      confirmColor: '#D64541',
      success: (r) => {
        if (!r.confirm) return;
        wx.setStorageSync('kfp_demo_mode', '1');
        wx.setStorageSync('kfp_demo_enter', '1');
        wx.switchTab({ url: '/pages/chat/chat' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '오늘의 한국어 | AI 韩语口语教练',
      path: '/pages/home/home'
    };
  }
});