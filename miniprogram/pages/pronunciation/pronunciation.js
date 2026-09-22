const api = require('../../utils/api');
const voice = require('../../utils/voice');
const app = getApp();

const LESSONS = [
  { id: 'L1', level: '入门', emoji: '🅰️', text: '안녕하세요', zh: '你好 / 您好', roman: 'an-nyeong-ha-se-yo',
    tip: '五个音节慢慢读：안 녕 하 세 요。「세」轻轻咬住，「요」收尾上扬像问号。' },
  { id: 'L2', level: '入门', emoji: '👋', text: '안녕히 가세요', zh: '慢走（主人对客人说）', roman: 'an-nyeong-hi ga-se-yo',
    tip: '「히」要送气，嘴唇别太用力；结尾 세요 上扬。' },
  { id: 'L3', level: '日常', emoji: '🍲', text: '감사합니다', zh: '谢谢（最礼貌）', roman: 'gam-sa-ham-ni-da',
    tip: '收音「답」读 [m]，末尾读 ni-da，别读成「哈姆尼达」。' },
  { id: 'L4', level: '日常', emoji: '🍜', text: '주문할게요', zh: '我要点餐了', roman: 'ju-mun-hal-ge-yo',
    tip: '「할」ㄹ收音弹一下上齿龈；「게」读 ge 不读 kei。' },
  { id: 'L5', level: '进阶', emoji: '🎤', text: '사랑해요', zh: '我爱你', roman: 'sa-rang-hae-yo',
    tip: '两个 a 要清晰；랑해 之间 ㅎ 连读成 sa-rang-hae。' },
  { id: 'L6', level: '进阶', emoji: '✈️', text: '여권 좀 보여 주세요', zh: '请出示一下护照', roman: 'yeo-gwon jom bo-yeo ju-se-yo',
    tip: '보여 주세요 连读，中间别停顿。' }
];

Page({
  data: {
    lessons: LESSONS,
    currentIndex: 0,
    currentLesson: LESSONS[0],
    aiTarget: '', // 来自 AI 对话的跟读目标句（优先于课程）
    pronOpen: true,
    openIndex: -1,
    streak: 0,
    mastered: 0,
    pronTrend: [], // 最近 5 次真实评分（能力画像 pron_eval_log）
    recording: false,
    recordTime: 0,
    evaluating: false,
    lastEval: null,
    lessonsLoading: true,
    refreshing: false,
    evalScores: {}
  },

  onLoad() {
    this.recorder = wx.getRecorderManager();
    this._bindRecorder();
    api.whenReady().then(() => {
      this.loadStats();
      this.loadLessons(false);
    });
  },

  onShow() {
    // 录音管理器全局单例：聊天页会绑走回调，进入本页必须抢回来
    this._bindRecorder();
    // 聊天页「🎤 跟读」带入的 AI 回复句子 → 置为当前跟读目标
    const t = wx.getStorageSync('kfp_practice_target');
    if (t) {
      wx.removeStorageSync('kfp_practice_target');
      this.setData({
        aiTarget: t,
        pronOpen: true,
        lastEval: null
      }, () => wx.pageScrollTo({ scrollTop: 0, duration: 300 }));
      wx.showToast({ title: '跟读目标已就位 🎤', icon: 'none' });
    }
  },

  // 当前实际跟读目标：AI 句子优先，否则用课程句
  _currentTarget() {
    return this.data.aiTarget || this.data.currentLesson.text;
  },

  _bindRecorder() {
    if (!this.recorder) return;
    app.globalData.recorderOwner = this;
    if (this._recorderBound) return;
    this._recorderStopHandler = this._recorderStopHandler || ((res) => {
      if (app.globalData.recorderOwner === this) this._onRecStop(res);
    });
    this.recorder.onStop(this._recorderStopHandler);
    this._recorderBound = true;
  },

  _unbindRecorder() {
    if (app.globalData.recorderOwner === this) app.globalData.recorderOwner = null;
    if (!this.recorder || !this._recorderBound) return;
    if (typeof this.recorder.offStop === 'function') {
      this.recorder.offStop(this._recorderStopHandler);
      this._recorderBound = false;
    }
  },

  onHide() {
    this._unbindRecorder();
  },

  onUnload() {
    this._unbindRecorder();
    this._clearRecTimer();
  },

  loadStats() {
    // 真实连续天数 + 最近评分趋势：来自能力画像（后端每日统计与跟读评分落库）
    api.get('/api/abilities/' + app.globalData.userId).then((res) => {
      if (!res || !res.stats) return;
      this.setData({
        streak: res.stats.streak_days || 0,
        pronTrend: (res.pronLog || []).map((e) => e.score).slice(-5)
      });
    }).catch(() => {});
    // 「我会了」计数：来自真实落库的用户标记记录
    api.get('/api/profile/' + app.globalData.userId).then((res) => {
      const pm = res.progress || {};
      this.setData({ mastered: (pm.pron_mastered || []).length });
    }).catch(() => {});
  },

  /* === 折叠当前练习 === */
  onToggleCurrent() {
    this.setData({ pronOpen: !this.data.pronOpen });
  },

  /* === AI 动态课程 === */
  loadLessons(refresh) {
    if (refresh) this.setData({ refreshing: true });
    else this.setData({ lessonsLoading: true });
    api
      .post('/api/pronounce/lessons', { userId: app.globalData.userId, refresh: !!refresh })
      .then((res) => {
        if (res && res.lessons && res.lessons.length) {
          this.setData({ lessons: res.lessons, lessonsLoading: false, refreshing: false });
          if (refresh) wx.showToast({ title: '新课程已生成 ✨', icon: 'none' });
        } else {
          this.setData({ lessonsLoading: false, refreshing: false });
        }
      })
      .catch(() => {
        this.setData({ lessonsLoading: false, refreshing: false });
        if (refresh) wx.showToast({ title: '生成失败，请重试', icon: 'none' });
      });
  },

  onRefreshLessons() {
    if (this.data.refreshing) return;
    this.loadLessons(true);
  },

  /* === 播放标准音（后端 TTS，本地 Yuna 兜底）=== */
  onPlay() {
    voice.speak(this._currentTarget()).then((ok) => {
      if (ok === false) wx.showToast({ title: 'TTS 未就绪，暂无声音', icon: 'none' });
    });
  },

  /* === 按住跟读：真实录音 + 计时 === */
  onRecStart() {
    if (this.data.recording || this.data.evaluating) return;
    if (!app.globalData.serverCaps.asr) {
      wx.showToast({ title: '语音不可用：后端未配置 ASR', icon: 'none' });
      return;
    }
    this.setData({ recording: true, recordTime: 0, lastEval: null });
    this._startRecTimer();
    this.recorder.start({
      format: 'mp3',
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      duration: 30000
    });
  },

  onRecEnd() {
    if (!this.data.recording) return;
    this.recorder.stop();
    this._clearRecTimer();
  },

  _startRecTimer() {
    this._clearRecTimer();
    this._recT = setInterval(() => {
      this.setData({ recordTime: this.data.recordTime + 1 });
    }, 1000);
  },
  _clearRecTimer() {
    if (this._recT) { clearInterval(this._recT); this._recT = null; }
  },

  _onRecStop(res) {
    this.setData({ recording: false });
    this._clearRecTimer();
    if (!res || !res.tempFilePath || (res.duration || 0) < 700) {
      if (res && (res.duration || 0) > 0) {
        wx.showToast({ title: '太短了，读慢一点~', icon: 'none' });
      }
      return;
    }
    // 真实 AI 评分：录音 → 后端 ASR 识别 → AI 发音教练评价（结果落库进能力画像）
    const target = this._currentTarget();
    this.setData({ evaluating: true });
    wx.showLoading({ title: 'AI 评分中…' });
    api
      .uploadFile('/api/pronounce', res.tempFilePath, { target, userId: app.globalData.userId })
      .then((data) => {
        wx.hideLoading();
        const evalScores = { ...this.data.evalScores, [target]: data.score };
        this.setData({
          evaluating: false,
          evalScores,
          pronTrend: this.data.pronTrend.concat([data.score]).slice(-5),
          lastEval: {
            score: data.score,
            advice: data.advice || '',
            feedback: data.feedback || [],
            asr: data.asr_text || '',
            src: data.source || 'ai'
          }
        });
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ evaluating: false });
        wx.showToast({ title: '评分失败，请确认后端已启动', icon: 'none' });
      });
  },

  /* === 我会了（真实落库，不编造） === */
  onEval() {
    const target = this._currentTarget();
    api
      .post('/api/pronounce/mastered', { userId: app.globalData.userId, target })
      .then((res) => {
        this.setData({ mastered: (res && res.mastered) || this.data.mastered });
        wx.showToast({ title: '已掌握：' + target.slice(0, 14), icon: 'none' });
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
      })
      .catch(() => {
        wx.showToast({ title: '未同步：请检查网络后重试', icon: 'none' });
      });
  },

  /* === 再试一次 === */
  onRetryPron() {
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '按住 🎤 再来一次', icon: 'none', duration: 1200 });
  },

  /* === 课程卡片 === */
  onCardTap(e) {
    const i = e.currentTarget.dataset.i;
    const same = this.data.openIndex === i;
    this.setData({ openIndex: same ? -1 : i });
  },

  onCardPlay(e) {
    const i = this.data.lessons.findIndex((l) => l.id === e.currentTarget.dataset.id);
    if (i < 0) return;
    const l = this.data.lessons[i];
    voice.speak(l.text).then((ok) => {
      if (ok === false) wx.showToast({ title: 'TTS 未就绪，暂无声音', icon: 'none' });
    });
  },

  onCardGo(e) {
    const i = e.currentTarget.dataset.i;
    const lesson = this.data.lessons[i];
    this.setData({
      currentIndex: i,
      currentLesson: lesson,
      aiTarget: '', // 选择课程会替换 AI 跟读目标
      pronOpen: true,
      openIndex: -1,
      lastEval: null
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 300 });
    });
  },

  /* K-pop 学歌入口 */
  onGoSong() {
    wx.navigateTo({ url: '/pages/song/song' });
  }
});
