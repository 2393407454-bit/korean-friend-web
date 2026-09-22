// K-pop 学歌：上传歌词（图片 OCR / 文本）→ AI 歌名候选（用户确认）→ 分句学习 → 跟读评分（真实落库）
// 数据原则：歌名以用户确认为准；跟读分数来自 /api/pronounce（ASR+AI），来源标注不冒充专业评测
const api = require('../../utils/api');
const voice = require('../../utils/voice');
const app = getApp();

function formatConfidence(value) {
  const confidence = Number(value);
  if (!isFinite(confidence) || confidence <= 0) return '';
  return Math.round(Math.min(1, confidence) * 100) + '%';
}

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + month + '-' + day;
}

Page({
  data: {
    step: 'upload', // upload | confirm | study
    analyzing: false,
    analyzeMode: '',
    analyzeError: '',
    lyricText: '',
    fanGoal: '副歌听懂',
    todayCount: 0,
    todayGoal: 3,
    todayPercent: 0,
    fanStreak: 0,
    songQuery: '',
    candidates: [],
    summary: '',
    titleInput: '',
    artistInput: '',
    lines: [],
    lineScores: {}, // lineIdx -> {score, advice, asr_text, source} | {evaluating} | {error}
    mySongs: [],
    filteredSongs: [],
    showRoman: true,
    saving: false,
    recording: false,
    recordIdx: -1,
    recordTime: 0
  },

  onLoad() {
    this.recorder = wx.getRecorderManager();
    this._bindRecorder();
    this._loadFanCheckin();
    api.whenReady().then(() => this.loadSongs());
  },

  _loadFanCheckin() {
    const saved = wx.getStorageSync('song_fan_checkin_v1') || {};
    const today = localDate();
    if (saved.date !== today) {
      this.setData({ todayCount: 0, todayPercent: 0, fanStreak: saved.streak || 0 });
      return;
    }
    const count = Math.min(this.data.todayGoal, Number(saved.count) || 0);
    this.setData({ todayCount: count, todayPercent: Math.round(count / this.data.todayGoal * 100), fanStreak: Number(saved.streak) || 0 });
  },

  _saveFanCheckin(count, streak) {
    wx.setStorageSync('song_fan_checkin_v1', { date: localDate(), count, streak });
  },

  onPickFanGoal(e) {
    const goal = e.currentTarget.dataset.goal;
    if (goal) this.setData({ fanGoal: goal });
  },

  onFanCheckin() {
    const count = Math.min(this.data.todayGoal, (this.data.todayCount || 0) + 1);
    const streak = this.data.todayCount > 0 ? this.data.fanStreak : (this.data.fanStreak || 0) + 1;
    this.setData({ todayCount: count, todayPercent: Math.round(count / this.data.todayGoal * 100), fanStreak: streak });
    this._saveFanCheckin(count, streak);
    wx.showToast({ title: count >= this.data.todayGoal ? '今日追星任务完成' : '已打卡 1 句', icon: 'none' });
  },

  onShow() {
    // 录音管理器全局单例：进入本页时声明所有权，避免其他页面的回调重复处理。
    this._bindRecorder();
  },

  onHide() {
    this._unbindRecorder();
  },

  onUnload() {
    this._unbindRecorder();
    this._clearRecTimer();
    voice.stop();
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

  loadSongs() {
    api.get('/api/song/list/' + app.globalData.userId).then((res) => {
      const songs = (res && res.songs) || [];
      this.setData({ mySongs: songs, filteredSongs: this._filterSongs(songs, this.data.songQuery) });
    }).catch(() => {});
  },

  _filterSongs(songs, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((song) => (String(song.title || '') + ' ' + String(song.artist || '')).toLowerCase().includes(q));
  },

  onSongQuery(e) {
    const songQuery = e.detail.value || '';
    this.setData({ songQuery, filteredSongs: this._filterSongs(this.data.mySongs, songQuery) });
  },

  onDeleteSong(e) {
    const songId = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '这首歌';
    if (!songId) return;
    wx.showModal({
      title: '删除歌词卡？',
      content: '删除「' + title + '」后，歌词学习卡和这首歌的学习记录都会移除，确定继续吗？',
      confirmText: '删除',
      confirmColor: '#D64541',
      success: (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: '删除中…', mask: true });
        api.post('/api/song/delete', { userId: app.globalData.userId, songId })
          .then(() => {
            const songs = this.data.mySongs.filter((song) => song.id !== songId);
            this.setData({ mySongs: songs, filteredSongs: this._filterSongs(songs, this.data.songQuery) });
            wx.hideLoading();
            wx.showToast({ title: '已删除歌词卡', icon: 'none' });
          })
          .catch((error) => {
            wx.hideLoading();
            wx.showToast({ title: (error && error.error) || '删除失败，请重试', icon: 'none' });
          });
      }
    });
  },

  /* ---------- 上传与分析 ---------- */
  onLyricInput(e) {
    this.setData({ lyricText: e.detail.value });
  },

  onChooseImage() {
    if (this.data.analyzing) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (r) => {
        const f = r.tempFiles && r.tempFiles[0];
        if (!f) return;
        // 相册原图可能几 MB；先压到适合歌词 OCR 的尺寸，减少上传和 VLM 图片处理时间。
        wx.compressImage({
          src: f.tempFilePath,
          quality: 72,
          compressedWidth: 1600,
          success: (compressed) => this._analyze({ filePath: compressed.tempFilePath, source: 'image' }),
          fail: () => this._analyze({ filePath: f.tempFilePath, source: 'image' })
        });
      }
    });
  },

  onChooseLrcFile() {
    if (this.data.analyzing) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['lrc'],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file || !file.path) return;
        this._analyze({ filePath: file.path, source: 'lrc' });
      },
      fail: () => wx.showToast({ title: '请选择 LRC 歌词文件', icon: 'none' })
    });
  },

  onAnalyzeText() {
    if (this.data.analyzing) return;
    const text = (this.data.lyricText || '').trim();
    if (!text) return wx.showToast({ title: '先粘贴一段歌词', icon: 'none' });
    this._analyze({ text, source: 'paste' });
  },

  _analyze({ filePath, text, source }) {
    const mode = source === 'image' ? 'image' : (source === 'lrc' ? 'file' : 'text');
    this.setData({ analyzing: true, analyzeMode: mode, analyzeError: '' });
    const ok = (res) => {
      this.setData({ analyzing: false, analyzeMode: '' });
      if (!res || !res.lines || !res.lines.length) {
        return this.setData({ analyzeError: '没解析出可学习的句子，换张更清晰的图或直接粘贴文本' });
      }
      const candidates = (res.candidates || []).map((candidate) => Object.assign({}, candidate, {
        confidenceText: formatConfidence(candidate && candidate.confidence)
      }));
      this.setData({
        candidates,
        summary: res.summary || '',
        titleInput: candidates.length ? candidates[0].title : '',
        artistInput: candidates.length ? candidates[0].artist : '',
        lines: (res.lines || []).map((l, i) => Object.assign({ _i: i }, l)),
        lineScores: {},
        step: 'confirm'
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 300 });
    };
    const fail = () => this.setData({ analyzing: false, analyzeMode: '', analyzeError: '分析失败，请检查网络后重试' });
    if (filePath) api.uploadFile('/api/song/analyze', filePath, { source }).then(ok).catch(fail);
    else api.post('/api/song/analyze', { text, source: source || 'paste' }).then(ok).catch(fail);
  },

  /* ---------- 歌名确认 ---------- */
  onPickCandidate(e) {
    const c = this.data.candidates[e.currentTarget.dataset.i];
    if (!c) return;
    this.setData({ titleInput: c.title, artistInput: c.artist });
  },

  onTitleInput(e) { this.setData({ titleInput: e.detail.value }); },
  onArtistInput(e) { this.setData({ artistInput: e.detail.value }); },

  onBackUpload() {
    this.setData({ step: 'upload', candidates: [], lines: [], analyzeError: '', lyricText: '' });
  },

  onSaveSong() {
    const title = (this.data.titleInput || '').trim();
    if (!title) return wx.showToast({ title: '请确认或输入歌名', icon: 'none' });
    if (this.data.saving) return;
    this.setData({ saving: true });
    api.post('/api/song/save', {
      userId: app.globalData.userId,
      title,
      artist: (this.data.artistInput || '').trim(),
      summary: (this.data.summary || '').trim(),
      lines: this.data.lines
    }).then((res) => {
      this.setData({ saving: false, step: 'study' });
      this.loadSongs();
      wx.showToast({ title: '已加入我的歌曲 🎵', icon: 'none' });
    }).catch((e) => {
      this.setData({ saving: false });
      wx.showToast({ title: (e && e.error) || '保存失败', icon: 'none' });
    });
  },

  /* ---------- 学习：点读 / 跟读评分 / 生词 ---------- */
  onSpeakLine(e) {
    const line = this.data.lines[e.currentTarget.dataset.i];
    if (line && line.ko) voice.speak(line.ko);
  },

  onToggleRoman() {
    this.setData({ showRoman: !this.data.showRoman });
  },

  onLineRecord(e) {
    const i = e.currentTarget.dataset.i;
    if (this.data.recording) {
      if (this.data.recordIdx === i) { this.recorder.stop(); return; }
      return; // 录别的句子时先把当前停掉（简单互斥：等当前停止回调）
    }
    const line = this.data.lines[i];
    if (!line || !line.ko) return;
    if (!app.globalData.serverCaps.asr) {
      return wx.showToast({ title: '后端未配置语音识别', icon: 'none' });
    }
    this.setData({ recording: true, recordIdx: i, recordTime: 0 });
    this._startRecTimer();
    this.recorder.start({ format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 96000, duration: 30000 });
  },

  _onRecStop(res) {
    const i = this.data.recordIdx;
    this.setData({ recording: false, recordTime: 0, recordIdx: -1 });
    this._clearRecTimer();
    if (!res || !res.tempFilePath || i < 0) return;
    const line = this.data.lines[i];
    if (!line) return;
    this.setData({ ['lineScores[' + i + ']']: { evaluating: true } });
    api.uploadFile('/api/pronounce', res.tempFilePath, { target: line.ko, userId: app.globalData.userId })
      .then((r) => {
        this.setData({
          ['lineScores[' + i + ']']: {
            score: r.score, advice: r.advice, asr_text: r.asr_text, source: r.source
          }
        });
        wx.showToast({ title: '得分 ' + (r.score || 0), icon: 'none' });
      })
      .catch(() => {
        this.setData({ ['lineScores[' + i + ']']: { error: true } });
        wx.showToast({ title: '评分失败，请重试', icon: 'none' });
      });
  },

  onAddVocab(e) {
    const d = e.currentTarget.dataset;
    const line = this.data.lines[d.i];
    const w = line && line.vocab && line.vocab[d.v];
    if (!w || !w.ko) return;
    api.post('/api/song/vocab', { userId: app.globalData.userId, ko: w.ko, zh: w.zh }).then((r) => {
      wx.showToast({ title: r && r.added ? '已入生词本 📒' : '生词本里已有', icon: 'none' });
    }).catch(() => wx.showToast({ title: '添加失败', icon: 'none' }));
  },

  /* ---------- 我的歌曲 ---------- */
  onOpenSong(e) {
    const id = e.currentTarget.dataset.id;
    api.get('/api/song/get/' + app.globalData.userId + '/' + id).then((res) => {
      const song = res && res.song;
      if (!song || !song.lines) return wx.showToast({ title: '歌曲读取失败', icon: 'none' });
      this.setData({
        titleInput: song.title,
        artistInput: song.artist,
        summary: song.summary || '',
        lines: song.lines.map((l, i) => Object.assign({ _i: i }, l)),
        lineScores: {},
        showRoman: true,
        step: 'study'
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 300 });
    }).catch(() => wx.showToast({ title: '歌曲读取失败', icon: 'none' }));
  },

  onNewSong() {
    this.setData({ step: 'upload', lyricText: '', candidates: [], lines: [], analyzeError: '' });
  },

  /* ---------- 录音计时 ---------- */
  _startRecTimer() {
    this._clearRecTimer();
    this._recT = setInterval(() => {
      this.setData({ recordTime: this.data.recordTime + 1 });
    }, 1000);
  },
  _clearRecTimer() {
    if (this._recT) { clearInterval(this._recT); this._recT = null; }
  }
});