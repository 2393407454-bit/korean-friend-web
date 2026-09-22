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
    reportData: null,
    nickname: '',
    avatarUrl: '',
    accountType: '设备访客',
    vocabN: 0,
    grammarN: 0,
    errorN: 0,
    // 能力画像（Phase 11：真实评分 + 手写 canvas 图表）
    abDims: [],
    abOverall: null,
    abBasis: '',
    abHistory: [],
    historyOk: false,
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
    api.whenReady().then(() => this.load());
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
      });
      this.loadAbilities();
    }).catch(() => {});
  },

  /* ===== 能力画像 + 手写 canvas 图表（Phase 11，评分全部来自后端数据引擎） ===== */
  loadAbilities() {
    api.get('/api/abilities/' + app.globalData.userId).then((res) => {
      if (!res) return;
      const history = (res.history || []).filter((h) => h.overall != null);
      this.setData({
        abDims: res.dims || [],
        abOverall: res.overall == null ? null : res.overall,
        abBasis: res.overallBasis || '',
        abHistory: history,
        historyOk: history.length >= 2
      }, () => setTimeout(() => this.drawCharts(), 80));
    }).catch(() => {});
  },

  drawCharts() {
    this.drawRadar();
    this.drawTrend();
    // 首次渲染 canvas 节点可能未就绪（wx:if 刚翻转为 true），补一次重试
    if (!this._chartRetried) {
      this._chartRetried = true;
      setTimeout(() => {
        this.drawRadar();
        this.drawTrend();
      }, 350);
    }
  },

  _getCanvas(id, cb) {
    const q = wx.createSelectorQuery().in(this);
    q.select('#' + id).fields({ node: true, size: true }).exec((rs) => {
      if (!rs || !rs[0] || !rs[0].node) return cb(null);
      const canvas = rs[0].node;
      const info = wx.getWindowInfo ? wx.getWindowInfo() : { pixelRatio: 2 };
      const dpr = info.pixelRatio || 2;
      canvas.width = rs[0].width * dpr;
      canvas.height = rs[0].height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      cb({ ctx, w: rs[0].width, h: rs[0].height });
    });
  },

  drawRadar() {
    if (!this.data.abDims.length) return;
    this._getCanvas('radarCanvas', (c) => {
      if (!c) return;
      const { ctx, w, h } = c;
      const cx = w / 2;
      const cy = h / 2 + 6;
      const R = Math.min(w, h) / 2 - 44;
      const N = this.data.abDims.length;
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
      const anyScore = this.data.abDims.some((d) => d.score != null);
      if (anyScore) {
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const d = this.data.abDims[i];
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
          const d = this.data.abDims[i];
          if (d.score == null) continue;
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
          const r = (R * Math.max(6, d.score)) / 100;
          const x = cx + r * Math.cos(ang);
          const y = cy + r * Math.sin(ang);
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          // 分数小字
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
        const lx = cx + (R + 26) * Math.cos(ang);
        const ly = cy + (R + 26) * Math.sin(ang);
        ctx.textAlign = Math.abs(Math.cos(ang)) < 0.3 ? 'center' : Math.cos(ang) > 0 ? 'left' : 'right';
        ctx.textBaseline = Math.sin(ang) > 0.5 ? 'top' : Math.sin(ang) < -0.5 ? 'bottom' : 'middle';
        ctx.fillText(this.data.abDims[i].label, lx, ly);
      }
    });
  },

  drawTrend() {
    if (!this.data.historyOk) return;
    this._getCanvas('trendCanvas', (c) => {
      if (!c) return;
      const { ctx, w, h } = c;
      const hist = this.data.abHistory;
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

      // 极值标注
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillStyle = '#86868B';
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.round(max)), 4, yAt(max) + 3);
      ctx.fillText(String(Math.round(min)), 4, yAt(min) + 3);
      // 网格基线
      ctx.strokeStyle = 'rgba(14, 24, 54, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, yAt(max));
      ctx.lineTo(w - padR, yAt(max));
      ctx.moveTo(padL, yAt(min));
      ctx.lineTo(w - padR, yAt(min));
      ctx.stroke();
      // 折线 + 面积
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
      // 顶点
      hist.forEach((x, i) => {
        ctx.beginPath();
        ctx.arc(xAt(i), yAt(x.overall), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#0071E3';
        ctx.fill();
      });
      // 最新值
      const lastV = hist[hist.length - 1].overall;
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.fillStyle = '#0058C9';
      ctx.textAlign = 'right';
      ctx.fillText(String(lastV) + ' 分', w - padR, yAt(lastV) - 6);
    });
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
      .post('/api/report', { userId: app.globalData.userId })
      .then((res) => {
        wx.hideLoading();
        if (res && res.report) {
          this.setData({ reportData: res.report });
          wx.vibrateShort && wx.vibrateShort({ type: 'light' });
        } else {
          wx.showToast({ title: '报告生成失败，请重试', icon: 'none' });
        }
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
          this.setData({ reportData: null, abDims: [], abOverall: null, abHistory: [], historyOk: false, vocabN: 0, grammarN: 0, errorN: 0 });
          wx.showToast({ title: '档案已重置', icon: 'none' });
          this.load();
        });
      }
    });
  }
});
