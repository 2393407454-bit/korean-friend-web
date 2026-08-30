const api = require('../../utils/api');
const config = require('../../utils/config');
const app = getApp();

const GOAL_TEXT = {
  kpop: '追星 🎤',
  kdrama: '韩剧 📺',
  study: '留学 🎓',
  work: '工作 💼',
  travel: '旅行 ✈️',
  hobby: '兴趣 ✨'
};

// 数字滚动：把目标值以动画形式一点点加出来
function tweenNum(page, field, to, duration = 800) {
  const from = page.data[field] || 0;
  const start = Date.now();
  const tick = () => {
    const p = Math.min(1, (Date.now() - start) / duration);
    // easeOutCubic
    const ease = 1 - Math.pow(1 - p, 3);
    const v = Math.round(from + (to - from) * ease);
    page.setData({ [field]: v });
    if (p < 1) setTimeout(tick, 20);
  };
  tick();
}

function tap(ctx, key, duration = 140) {
  ctx.setData({ [key]: true });
  setTimeout(() => ctx.setData({ [key]: false }), duration);
}

Page({
  data: {
    profile: {},
    progress: {},
    recentErrors: [],
    report: '',
    nickname: '',
    avatarUrl: '',
    accountType: '设备访客',
    vocabN: 0,
    grammarN: 0,
    errorN: 0,
    overallPct: 0,
    vTap: '',
    genTap: false,
    resetTap: false,
    fbText: '',
    fbSending: false,
    isAdmin: false,
    adminMessages: [],
    adminLoading: false,
    noticeDraft: ''
  },

  onShow() {
    this.load();
  },

  load() {
    api.get('/api/profile/' + app.globalData.userId).then((res) => {
      const progress = res.progress || {};
      const profile = res.profile || {};
      profile.goalDisplay = profile.goal ? GOAL_TEXT[profile.goal] || profile.goal : '';

      const vocabN = progress.vocab ? progress.vocab.length : 0;
      const grammarN = progress.grammar_mastered ? progress.grammar_mastered.length : 0;
      const errorN = progress.error_log ? progress.error_log.length : 0;

      this.setData({
        profile,
        progress,
        nickname: profile.nickname || '',
        avatarUrl: profile.avatar ? config.BASE_URL + profile.avatar : '',
        accountType: app.globalData.userId.indexOf('wx_') === 0 ? '微信用户' : '设备访客',
        recentErrors: (progress.error_log || []).slice(-5).reverse()
      }, () => {
        // 数字滚动动画
        tweenNum(this, 'vocabN', vocabN);
        tweenNum(this, 'grammarN', grammarN);
        tweenNum(this, 'errorN', errorN);
        // 综合进度：取三项的简单加权平均，取上限100
        const raw = Math.round(
          (Math.min(vocabN, 50) / 50 * 40) +
          (Math.min(grammarN, 20) / 20 * 40) +
          (Math.min(errorN, 10) / 10 * 20)
        );
        setTimeout(() => this.setData({ overallPct: Math.min(99, raw) }), 120);
      });
    }).catch(() => {});
  },

  /* === 留言给开发者（仅管理员可见） === */
  onFeedbackInput(e) {
    this.setData({ fbText: e.detail.value });
  },

  onFeedbackSubmit() {
    const content = (this.data.fbText || '').trim();
    if (!content) {
      wx.showToast({ title: '先写点什么再提交哦', icon: 'none' });
      return;
    }
    if (this.data.fbSending) return;
    this.setData({ fbSending: true });
    api
      .post('/api/feedback', {
        userId: app.globalData.userId,
        nickname: this.data.nickname || '',
        content
      })
      .then(() => {
        this.setData({ fbText: '', fbSending: false });
        wx.showToast({ title: '已送达开发者 ✨', icon: 'none' });
      })
      .catch(() => {
        this.setData({ fbSending: false });
        wx.showToast({ title: '发送失败，请重试', icon: 'none' });
      });
  },

  /* === 管理员面板（长按版本号进入） === */
  onVersionLongPress() {
    if (this.data.isAdmin) return;
    wx.showModal({
      title: '管理员验证',
      content: '输入管理密钥',
      editable: true,
      placeholderText: 'ADMIN_KEY',
      success: (res) => {
        if (!res.confirm) return;
        const key = (res.content || '').trim();
        if (!key) return;
        api.post('/api/admin/verify', { key }).then((r) => {
          if (r && r.ok) {
            wx.setStorageSync('kfp_admin_key', key);
            this.setData({ isAdmin: true });
            this.loadAdminMessages();
            wx.showToast({ title: '管理员模式已开启', icon: 'none' });
          } else {
            wx.showToast({ title: '密钥错误', icon: 'none' });
          }
        }).catch(() => wx.showToast({ title: '验证失败', icon: 'none' }));
      }
    });
  },

  loadAdminMessages() {
    const key = wx.getStorageSync('kfp_admin_key');
    this.setData({ adminLoading: true });
    api.get('/api/admin/messages?key=' + encodeURIComponent(key)).then((res) => {
      this.setData({ adminMessages: (res && res.messages) || [], adminLoading: false });
    }).catch(() => this.setData({ adminLoading: false }));
  },

  onNoticeDraftInput(e) {
    this.setData({ noticeDraft: e.detail.value });
  },

  onNoticePublish() {
    const content = (this.data.noticeDraft || '').trim();
    if (!content) {
      wx.showToast({ title: '先写公告内容', icon: 'none' });
      return;
    }
    const key = wx.getStorageSync('kfp_admin_key');
    api.post('/api/admin/notice', { key, content }).then(() => {
      this.setData({ noticeDraft: '' });
      wx.showToast({ title: '公告已发布，用户可见 📢', icon: 'none' });
    }).catch(() => wx.showToast({ title: '发布失败', icon: 'none' }));
  },

  onNoticeClear() {
    const key = wx.getStorageSync('kfp_admin_key');
    api.post('/api/admin/clear-notice', { key }).then(() => {
      this.setData({ noticeDraft: '' });
      wx.showToast({ title: '公告已撤下', icon: 'none' });
    });
  },

  /* 统计卡片按压 */
  onStatDown(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ vTap: k });
    setTimeout(() => this.setData({ vTap: '' }), 160);
  },
  onStatUp() {},

  /* === 微信快捷资料：头像 + 昵称 === */
  onChooseAvatar(e) {
    const tempPath = e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    this.setData({ avatarUrl: tempPath }); // 先本地预览
    api
      .uploadFile('/api/profile/' + app.globalData.userId + '/avatar', tempPath, { userId: app.globalData.userId })
      .then((res) => {
        if (res && res.avatar) {
          this.setData({ avatarUrl: config.BASE_URL + res.avatar });
          wx.showToast({ title: '头像已保存 ✨', icon: 'none' });
        }
      })
      .catch(() => wx.showToast({ title: '头像保存失败', icon: 'none' }));
  },

  onNicknameBlur(e) {
    const v = (e.detail.value || '').trim();
    if (!v || v === this.data.nickname) return;
    api
      .post('/api/profile/' + app.globalData.userId + '/update', { nickname: v })
      .then(() => {
        this.setData({ nickname: v });
        wx.showToast({ title: '昵称已保存 ✨', icon: 'none' });
      })
      .catch(() => wx.showToast({ title: '保存失败', icon: 'none' }));
  },
  onStatTap(e) {
    const k = e.currentTarget.dataset.k;
    const map = {
      vocab:   { icon: '📒', title: '生词本',  value: this.data.vocabN,   tip: '坚持每天复习 10 个就行！' },
      grammar: { icon: '📚', title: '语法',   value: this.data.grammarN, tip: '掌握一个就少一个盲点 ✨' },
      error:   { icon: '📝', title: '错误记录', value: this.data.errorN,   tip: '错一次 = 赚一次记忆点' }
    };
    const m = map[k];
    wx.showModal({
      title: m.icon + ' ' + m.title,
      content: '共 ' + m.value + ' 条。\n' + m.tip,
      showCancel: false,
      confirmText: '好哒',
      confirmColor: '#0C54E0'
    });
  },

  /* 生成报告 */
  onGenDown() { tap(this, 'genTap', 180); },
  onGenUp() {},

  onGenReport() {
    wx.showLoading({ title: '老师整理中…' });
    api
      .post('/api/chat', {
        userId: app.globalData.userId,
        text: '进度报告',
        channel: 'text',
        mode: '报告'
      })
      .then((res) => {
        wx.hideLoading();
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
        this.setData({ report: res.display || res.speech || '(空)' });
        this.load();
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '生成失败，请确认后端已启动', icon: 'none' });
      });
  },

  /* 重置 */
  onResetDown() { tap(this, 'resetTap', 180); },
  onResetUp() {},

  onReset() {
    wx.showModal({
      title: '重置档案',
      content: '将清空定级、生词本和错误记录，确定吗？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (!res.confirm) return;
        api.post('/api/profile/' + app.globalData.userId + '/reset', {}).then(() => {
          this.setData({ report: '', vocabN: 0, grammarN: 0, errorN: 0, overallPct: 0 });
          wx.showToast({ title: '档案已重置', icon: 'none' });
          this.load();
        });
      }
    });
  }
});
