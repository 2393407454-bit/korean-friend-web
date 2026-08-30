const api = require('../../utils/api');
const voice = require('../../utils/voice');
const streamUtil = require('../../utils/stream');
const mdparse = require('../../utils/mdparse');
const app = getApp();

const MODES = [
  { label: '聊天', text: '聊天' },
  { label: '情景·餐厅', text: '情景：餐厅点餐' },
  { label: '情景·机场', text: '情景：机场入关' },
  { label: '练发音', text: '练发音' },
  { label: '测水平', text: '测水平' }
];

const TOPICS = [
  { label: '💜 K-pop 追星', text: '我想聊 K-pop！用韩语教我几句应援话，带罗马音' },
  { label: '📺 韩剧', text: '推荐一部适合初学者的韩剧，教我剧里的经典台词' },
  { label: '✈️ 旅行问路', text: '我准备去韩国旅行，教我机场、地铁、问路的实用句子' },
  { label: '🍲 美食点餐', text: '带我在韩国餐厅点餐！教我点餐用语（场景模拟）' },
  { label: '📚 TOPIK 备考', text: '我在备考 TOPIK，讲一个常考语法点并出 2 道练习题' },
  { label: '👋 日常问候', text: '教我韩国人日常打招呼的 5 种说法和使用场景' }
];

const FALLBACK_CHARACTERS = [
  { id: 'jiwoo', name: '지우 智秀', avatar: '🐯', tagline: '温柔老师' },
  { id: 'minjun', name: '민준 敏俊', avatar: '🐣', tagline: '活泼朋友' },
  { id: 'gwajang', name: '김 선생 金老师', avatar: '📚', tagline: 'TOPIK 考官' }
];

// 交互层原则：点击一律 bindtap；只有按住说话用 touch 事件

Page({
  data: {
    modes: MODES,
    topics: TOPICS,
    currentMode: '聊天',
    characters: FALLBACK_CHARACTERS,
    character: FALLBACK_CHARACTERS[0],
    status: 'listening', // listening | typing
    messages: [],
    inputText: '',
    recording: false,
    recordTime: 0,
    ttsEnabled: wx.getStorageSync('kfp_tts') !== false,
    scrollInto: '',
    notice: null
  },

  onLoad() {
    this.msgSeq = 0;
    this._loadedUid = app.globalData.userId;
    this.recorder = wx.getRecorderManager();
    this._bindRecorder();
    this.loadNotice();

    const saved = wx.getStorageSync('kfp_character');
    if (saved && saved.id) this.setData({ character: saved });

    this.loadCharacters();
    this.pushAssistant(
      '안녕하세요! 만나서 반가워요~ 😊\n你好！我是你的韩语伙伴。\n告诉我：① 你的韩语水平？② 为什么学韩语（追星/留学/工作/兴趣）？也可以点上方话题直接开聊！',
      null,
      true
    );
    this.loadHistory();
  },

  onReady() {
    // 记录消息区视口高度，供「是否在底部」判断使用
    wx.createSelectorQuery().in(this).select('.messages').boundingClientRect((r) => {
      if (r && r.height) this._viewportH = r.height;
    }).exec();
  },

  onShow() {
    api.get('/api/health').then((caps) => {
      if (caps) app.globalData.serverCaps = caps;
    }).catch(() => {});
    this._bindRecorder();
    // 名句页「💬 问 AI」联动：读取一次性预填提问并自动发送
    const prefill = wx.getStorageSync('kfp_chat_prefill');
    if (prefill) {
      wx.removeStorageSync('kfp_chat_prefill');
      this.sendText(prefill, 'text');
    }
    // 微信登录接管导致 uid 变更时，按新账号重置消息流重新加载
    const uid = app.globalData.userId;
    const uidChanged = this._loadedUid && this._loadedUid !== uid;
    if (uidChanged) {
      this.msgSeq = 0;
      this.setData({ messages: [], scrollInto: '' });
      this.pushAssistant(
        '안녕하세요! 새 계정으로 시작했어요~ 😊\n已切换到新账号，我们重新开始吧！\n告诉我：① 你的韩语水平？② 为什么学韩语？',
        null,
        true
      );
    }
    this._loadedUid = uid;
    // 首次进入已在 onLoad 加载过；仅在账号变更或消息为空时重新拉取，避免重复
    if (uidChanged || !this.data.messages.length) this.loadHistory();
  },

  _bindRecorder() {
    this.recorder.onStop((res) => this.onRecordStop(res));
  },

  onUnload() {
    this._clearRecTimer();
    if (this._twTimer) clearInterval(this._twTimer);
  },

  loadNotice() {
    // 管理员公告：读过同一条（按时间戳）就不再弹出
    api.get('/api/notice').then((res) => {
      const n = res && res.notice;
      if (!n || !n.content) return;
      if (wx.getStorageSync('kfp_notice_dismissed') === n.at) return;
      this.setData({ notice: n });
    }).catch(() => {});
  },

  onNoticeClose() {
    const n = this.data.notice;
    if (n) wx.setStorageSync('kfp_notice_dismissed', n.at);
    this.setData({ notice: null });
  },

  loadCharacters() {
    api.get('/api/characters').then((res) => {
      if (res && res.characters && res.characters.length) {
        this.setData({ characters: res.characters });
        const saved = wx.getStorageSync('kfp_character');
        if (saved && saved.id) {
          const found = res.characters.find((c) => c.id === saved.id);
          if (found) this.setData({ character: found });
        }
      }
    }).catch(() => {});
  },

  onAvatarTap() {
    const list = this.data.characters;
    wx.showActionSheet({
      itemList: list.map((c) => c.avatar + ' ' + c.name + ' · ' + c.tagline),
      success: (res) => {
        const c = list[res.tapIndex];
        if (!c) return;
        this.setData({ character: c });
        wx.setStorageSync('kfp_character', c);
        wx.showToast({ title: '已切换：' + c.name, icon: 'none' });
      }
    });
  },

  onNewSession() {
    wx.showModal({
      title: '开始新对话',
      content: '当前对话会存入历史，确定重新开始吗？',
      confirmColor: '#0C54E0',
      success: (res) => {
        if (!res.confirm) return;
        api.post('/api/session/new', { userId: app.globalData.userId }).then(() => {
          this.msgSeq = 0;
          this.setData({ messages: [], scrollInto: '' });
          this.pushAssistant(
            '새 대화 시작! 🎉\n新对话开始啦～今天想练点什么？\n可以点上方话题，也可以直接打字或按住说话！',
            null,
            true
          );
        }).catch(() => wx.showToast({ title: '操作失败，请重试', icon: 'none' }));
      }
    });
  },

  loadHistory() {
    api.get('/api/profile/' + app.globalData.userId).then((res) => {
      if (res && res.messages && res.messages.length) {
        const loaded = res.messages.slice(-20).filter((m) => m.content && m.content !== '…').map((m) => {
          const text = m.content;
          return m.role === 'user'
            ? { id: 'm' + ++this.msgSeq, role: 'user', text }
            : { id: 'm' + ++this.msgSeq, role: 'assistant', text, blocks: mdparse.parse(text) };
        });
        // 一次性批量上屏：避免循环 setData + scrollInto 连续变化造成的卡顿
        const messages = this.data.messages.concat(loaded);
        this.setData({ messages, scrollInto: 'msg-' + (messages.length - 1) });
      }
    }).catch(() => {});
  },

  pushMessage(role, text, extra = {}) {
    const id = 'm' + ++this.msgSeq;
    const msg = { id, role, text, ...extra };
    if (role === 'assistant' && !extra.pending && !extra.streaming) {
      msg.blocks = mdparse.parse(text);
    }
    const messages = this.data.messages.concat([msg]);
    this.setData({ messages, scrollInto: 'msg-' + (messages.length - 1) });
    return id;
  },

  // 朗读策略（按需求）：不自动朗读——只有用户点「🔊 读」等按钮时才出声
  pushAssistant(text, speech, silent) {
    this.pushMessage('assistant', text || '…', { speech });
  },

  maybeSpeak(speech) {
    if (!speech) return;
    voice.speak(speech).then((ok) => this._ttsTip(ok));
  },

  _ttsTip(ok) {
    // 'stopped'=用户手动停止，不算异常；false=合成失败才提示
    if (ok === 'stopped' || ok) return;
    if (this._ttsTipShown) return;
    this._ttsTipShown = true;
    wx.showToast({ title: '语音播报暂不可用（后端 TTS 未就绪）', icon: 'none', duration: 2200 });
    setTimeout(() => (this._ttsTipShown = false), 15000);
  },

  /* ---------------- 输入与发送（流式） ---------------- */
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onSend() {
    const text = (this.data.inputText || '').trim();
    if (!text || this.data.status === 'typing') return;
    this.setData({ inputText: '' });
    this.sendText(text, 'text');
  },

  sendText(text, channel) {
    this.pushMessage('user', text);
    const pendingId = this.pushMessage('assistant', '', { pending: true });
    this.setData({ status: 'typing', scrollInto: 'msg-' + (this.data.messages.length - 1) });
    this._twStarted = false;
    this._twPendingId = pendingId;

    streamUtil.streamChat({
      data: {
        userId: app.globalData.userId,
        text,
        channel,
        mode: this.data.currentMode,
        characterId: this.data.character.id
      },
      onDelta: (d) => this._twAppend(d),
      onDone: (final) => this._twDone(pendingId, final),
      onError: (e) => this._twFail(pendingId, e)
    });
  },

  /* ---- 打字机引擎：增量入缓冲，定时逐字上屏 ----
     性能关键：
     - tick 50ms、每次推进 3 字，降低 setData 频率
     - tick 期间不写 scrollInto；仅在用户位于底部附近时由 _twScrollToBottom 吸底
     - 用户上滑（bindscroll 检测）即暂停吸底，滑回底部恢复 */
  _twAppend(delta) {
    if (this._twDoneFlag) return;
    if (!this._twStarted) {
      this._twStarted = true;
      const idx = this.data.messages.findIndex((m) => m.id === this._twPendingId);
      if (idx < 0) return;
      this._twIdx = idx;
      this._autoScroll = true;
      this.setData({
        ['messages[' + idx + ']']: { ...this.data.messages[idx], pending: false, streaming: true, text: '' }
      });
    }
    this._twBuf = (this._twBuf || '') + delta;
    if (!this._twTimer) {
      this._twTimer = setInterval(() => this._twTick(), 50);
    }
  },

  _twTick() {
    if (!this._twStarted) return;
    const buf = this._twBuf || '';
    const cut = buf.indexOf('@@STATE@@');
    let visibleLen = cut >= 0 ? cut : buf.length;
    if (cut < 0) {
      // 标记可能被拆成多个增量帧：末尾出现 @@ 开头的碎片时先扣住不显示
      const frag = buf.match(/@@[A-Z@]{0,9}$/);
      if (frag) visibleLen = frag.index;
    }
    if ((this._twShown || 0) < visibleLen) {
      this._twShown = Math.min(visibleLen, (this._twShown || 0) + 3);
      const shown = buf.slice(0, this._twShown);
      // 只更新文本本身；吸底滚动由节流版的 _twScrollToBottom 负责
      this.setData({ ['messages[' + this._twIdx + '].text']: shown });
      if (this._autoScroll !== false) this._twScrollToBottom();
    }
  },

  _twScrollToBottom() {
    const now = Date.now();
    if (this._lastScrollTs && now - this._lastScrollTs < 400) return; // 滚动节流
    this._lastScrollTs = now;
    this.setData({ scrollInto: 'msg-' + (this.data.messages.length - 1) });
  },

  /* 用户滚动位置跟踪：离底超过 200px 视为在回看历史，暂停自动吸底 */
  onMsgScroll(e) {
    const { scrollTop, scrollHeight } = e.detail || {};
    const query = wx.createSelectorQuery().in(this);
    // 用视口近似：scroll-view 高度未知时以 scrollTop+视口高 vs scrollHeight 判断
    const nearBottom = scrollHeight - scrollTop - (this._viewportH || 600) < 200;
    this._autoScroll = nearBottom;
  },

  onMsgScrollToUpper() {
    this._autoScroll = false;
  },

  _twDone(pendingId, final) {
    this._twDoneFlag = true;
    if (this._twTimer) { clearInterval(this._twTimer); this._twTimer = null; }
    // display 兜底：服务端帧缺失时用客户端缓冲文本（截掉状态行）
    let display = (final.display || '').trim();
    if (!display && this._twBuf) {
      const cut = this._twBuf.indexOf('@@STATE@@');
      display = (cut >= 0 ? this._twBuf.slice(0, cut) : this._twBuf).trim();
    }
    if (!display) display = '（AI 没有返回内容，请重新发送试试）';
    const idx = this.data.messages.findIndex((m) => m.id === pendingId);
    if (idx >= 0) {
      this.setData({
        ['messages[' + idx + ']']: {
          id: pendingId,
          role: 'assistant',
          text: display,
          blocks: mdparse.parse(display),
          speech: final.speech || '',
          korean: final.korean_sentences || [],
          pending: false,
          streaming: false
        },
        status: 'listening',
        scrollInto: 'msg-' + (this.data.messages.length - 1)
      });
    }
    this._twBuf = '';
    this._twShown = 0;
    this._twStarted = false;
    this._twDoneFlag = false;
    // 不自动朗读：想听就点气泡下方的「🔊 读」
  },

  _twFail(pendingId, e) {
    if (this._twTimer) { clearInterval(this._twTimer); this._twTimer = null; }
    const partial = (this._twShown || 0) > 0 ? '\n\n' : '';
    this._twBuf = '';
    this._twShown = 0;
    this._twStarted = false;
    this._twDoneFlag = false;
    const idx = this.data.messages.findIndex((m) => m.id === pendingId);
    if (idx >= 0) {
      this.setData({
        ['messages[' + idx + '].text']: (this.data.messages[idx].text || '') + partial + '😵 ' + (e.message || '请求失败'),
        ['messages[' + idx + '].pending']: false,
        ['messages[' + idx + '].streaming']: false,
        status: 'listening'
      });
    }
  },

  /* ---------------- 模式 / 话题 ---------------- */
  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ currentMode: mode.label });
    this.sendText(mode.text, 'text');
  },

  onTopicTap(e) {
    const topic = e.currentTarget.dataset.topic;
    if (topic && topic.text) this.sendText(topic.text, 'text');
  },

  onQuickTip() {
    wx.showActionSheet({
      itemList: ['打招呼 안녕하세요', '自我介绍', '常用词（礼貌语 vs 平语）', '问时间 / 地点'],
      success: (res) => {
        const prompts = [
          '안녕하세요! 처음 뵙겠습니다~ 请老师纠正我的语气 😊',
          '请帮我写一段简单自然的韩语自我介绍（初学者版），带罗马音和翻译',
          '请列出 10 个最常用的「礼貌语 vs 平语」对比，比如 안녕하세요 / 안녕',
          '지금 몇 시예요? / 어디예요? 这两句的用法，再给 3 个例句'
        ];
        this.sendText(prompts[res.tapIndex], 'text');
      }
    });
  },

  /* ---------------- 气泡操作 ---------------- */
  onSpeakTap(e) {
    const speech = e.currentTarget.dataset.speech;
    if (!speech) return;
    voice.speak(speech).then((ok) => this._ttsTip(ok));
  },

  onCopyTap(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制 ✨', icon: 'none' })
    });
  },

  onFollowTap(e) {
    const sentence = e.currentTarget.dataset.sentence;
    if (!sentence) return;
    wx.setStorageSync('kfp_practice_target', sentence);
    wx.switchTab({ url: '/pages/pronunciation/pronunciation' });
  },

  /* ---------------- TTS 开关 ---------------- */
  onTtsToggle() {
    const ttsEnabled = !this.data.ttsEnabled;
    wx.setStorageSync('kfp_tts', ttsEnabled);
    this.setData({ ttsEnabled });
    wx.showToast({ title: ttsEnabled ? '朗读开 🔊' : '朗读关 🔈', icon: 'none', duration: 800 });
  },

  /* ---------------- 语音：按住说话（上限 30 秒，ASR 限制） ---------------- */
  onVoiceStart() {
    if (this.data.recording) return;
    this.setData({ recording: true, recordTime: 0 });
    this._startRecTimer();
    if (app.globalData.serverCaps.asr) {
      this.recorder.start({
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 96000,
        duration: 30000
      });
    } else if (this.wxsiManager) {
      this.wxsiManager.start({ lang: 'zh_CN', duration: 30000 });
    } else {
      this.setData({ recording: false });
      this._clearRecTimer();
      wx.showToast({ title: '语音不可用：后端未配置 ASR', icon: 'none' });
    }
  },

  onVoiceEnd() {
    if (!this.data.recording) return;
    if (app.globalData.serverCaps.asr) this.recorder.stop();
    else if (this.wxsiManager) this.wxsiManager.stop();
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

  onRecordStop(res) {
    this.setData({ recording: false });
    this._clearRecTimer();
    if (!res || !res.tempFilePath || (res.duration || 0) < 800) return;
    this.pushMessage('user', '🎤 [语音]');
    const pendingId = this.pushMessage('assistant', '', { pending: true });
    api
      .uploadFile('/api/asr', res.tempFilePath, { userId: app.globalData.userId })
      .then((data) => {
        const text = (data && data.text || '').trim();
        if (!text) {
          this.replaceMessage(pendingId, '没听清，再说一次好吗？(다시 말씀해 주세요!)');
          return;
        }
        this.removeMessage(pendingId);
        this.sendText(text, 'voice');
      })
      .catch(() => {
        this.replaceMessage(pendingId, '😵 语音识别失败，请确认后端已配置 ASR。');
      });
  },

  replaceMessage(id, text, speech) {
    const idx = this.data.messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    // 按路径更新：避免整组数组替换导致节点重建、入场动画重放
    this.setData({
      ['messages[' + idx + '].text']: text,
      ['messages[' + idx + '].speech']: speech || '',
      ['messages[' + idx + '].pending']: false,
      scrollInto: 'msg-' + (this.data.messages.length - 1)
    });
  },

  removeMessage(id) {
    this.setData({ messages: this.data.messages.filter((m) => m.id !== id) });
  },

  /* ---------------- 文件上传 ---------------- */
  onUploadTap() {
    wx.showActionSheet({
      itemList: ['📸 拍照/相册（教材、菜单、路牌）', '📄 选择文档（txt/srt/md）'],
      success: (res) => {
        if (res.tapIndex === 0) this.uploadImage();
        else this.uploadDocument();
      }
    });
  },

  uploadImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => this.doUpload(res.tempFiles[0].tempFilePath, 'image')
    });
  },

  uploadDocument() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'md', 'srt', 'lrc'],
      success: (res) => this.doUpload(res.tempFiles[0].path, 'doc')
    });
  },

  doUpload(filePath, kind) {
    this.pushMessage('user', kind === 'image' ? '📎 [图片]' : '📎 [文档]');
    const pendingId = this.pushMessage('assistant', '', { pending: true });
    api
      .uploadFile('/api/upload', filePath, { userId: app.globalData.userId })
      .then((res) => {
        this.replaceMessage(pendingId, res.display || '(未识别到内容)', res.speech);
      })
      .catch(() => {
        this.replaceMessage(pendingId, '😵 文件处理失败，请重试。');
      });
  }
});
