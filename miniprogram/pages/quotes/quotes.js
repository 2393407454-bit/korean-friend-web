const api = require('../../utils/api');
const voice = require('../../utils/voice');
const quoteCard = require('../../utils/quoteCard');
const data = require('../../data/quotes-data');
const app = getApp();

const PAGE_SIZE = 8;
const FAV_KEY = () => 'kfp_fav_quotes_' + (app.globalData.userId || 'guest');

function loadFavs() {
  return wx.getStorageSync(FAV_KEY()) || {};
}

function normalizeQuote(quote) {
  const colors = Array.isArray(quote && quote.color) && quote.color.length >= 2
    ? quote.color.slice(0, 2)
    : ['#EAF3FF', '#DCEAFF'];
  return { ...(quote || {}), color: colors };
}

Page({
  data: {
    heroQuotes: [],
    themes: ['全部'].concat(data.THEMES),
    dramas: ['全部'].concat(data.DRAMAS),
    levels: ['全部'].concat(data.LEVELS),
    filter: { theme: '全部', drama: '全部', level: '全部' },
    favOnly: false,
    quotes: [],
    total: 0,
    favs: {},
    aiLoading: false,
    favCount: 0
  },

  onLoad() {
    this._all = data.QUOTES.map(normalizeQuote);
    const daily = data.dailyQuote();
    const hero = [daily].concat(
      this._all.filter((q) => q.id !== daily.id && q.drama !== '韩剧通用').slice(0, 4)
    );
    this.setData({ heroQuotes: hero, favs: loadFavs() });
    this._apply();
  },

  onShow() {
    // 收藏按账号隔离，切账号后回来刷新
    this.setData({ favs: loadFavs() });
    this._apply();
  },

  /* ---------------- 筛选 ---------------- */
  onFilterTap(e) {
    const { kind, value } = e.currentTarget.dataset;
    const filter = { ...this.data.filter, [kind]: value };
    this.setData({ filter, favOnly: false });
    this._apply();
  },

  onFavFilterTap() {
    this.setData({ favOnly: !this.data.favOnly });
    this._apply();
  },

  _apply() {
    const { filter, favOnly, favs } = this.data;
    const f = this._all.filter((q) => {
      if (filter.theme !== '全部' && q.theme !== filter.theme) return false;
      if (filter.drama !== '全部' && q.drama !== filter.drama) return false;
      if (filter.level !== '全部' && q.level !== filter.level) return false;
      if (favOnly && !favs[q.id]) return false;
      return true;
    });
    this._filtered = f;
    this._shown = Math.min(PAGE_SIZE, f.length);
    this._render();
  },

  _render() {
    const favs = this.data.favs;
    const quotes = (this._filtered || []).slice(0, this._shown).map((q) => ({
      ...q,
      isFav: !!favs[q.id]
    }));
    this.setData({
      quotes,
      total: (this._filtered || []).length,
      hasMore: this._shown < (this._filtered || []).length
    });
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this._shown += PAGE_SIZE;
      this._render();
    }
  },

  /* ---------------- 每卡操作 ---------------- */
  onSpeakTap(e) {
    const id = e.currentTarget.dataset.id;
    const q = this._find(id);
    if (q) voice.speak(q.ko).then((ok) => {
      if (!ok) wx.showToast({ title: 'TTS 未就绪，暂无声音', icon: 'none' });
    });
  },

  onFavTap(e) {
    const id = e.currentTarget.dataset.id;
    const q = this._find(id);
    if (!q) return;
    const favs = loadFavs();
    if (favs[id]) delete favs[id];
    else favs[id] = q;
    wx.setStorageSync(FAV_KEY(), favs);
    this.setData({ favs });
    this._render();
  },

  onFollowTap(e) {
    const id = e.currentTarget.dataset.id;
    const q = this._find(id);
    if (!q) return;
    wx.setStorageSync('kfp_practice_target', q.ko);
    wx.switchTab({ url: '/pages/pronunciation/pronunciation' });
  },

  onAskTap(e) {
    const id = e.currentTarget.dataset.id;
    const q = this._find(id);
    if (!q) return;
    wx.setStorageSync('kfp_chat_prefill',
      `韩剧《${q.drama}》台词「${q.ko}」（${q.zh}）这句话怎么理解？帮我逐句讲解语法和发音要点`);
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  onShareImgTap(e) {
    const id = e.currentTarget.dataset.id;
    const q = this._find(id);
    if (!q) return;
    wx.showLoading({ title: '生成卡片…' });
    quoteCard.make(q, (filePath) => {
      wx.hideLoading();
      if (!filePath) {
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }
      wx.showShareImageMenu({ path: filePath, fail: () => {} });
    });
  },

  _find(id) {
    return this._all.find((q) => q.id === id) || this.data.quotes.find((q) => q.id === id);
  },

  /* ---------------- AI 生成换一批 ---------------- */
  onAiGenerate() {
    if (this.data.aiLoading) return;
    this.setData({ aiLoading: true });
    const { filter } = this.data;
    api
      .post('/api/quotes/generate', {
        userId: app.globalData.userId,
        drama: filter.drama === '全部' ? '' : filter.drama,
        theme: filter.theme === '全部' ? '' : filter.theme,
        level: filter.level === '全部' ? '' : filter.level,
        refresh: true
      })
      .then((res) => {
        this.setData({ aiLoading: false });
        if (res && res.quotes && res.quotes.length) {
          this._all = res.quotes.map(normalizeQuote).concat(this._all);
          this.setData({ filter: { theme: '全部', drama: '全部', level: '全部' }, favOnly: false });
          this._apply();
          wx.showToast({ title: '新台词已生成 ✨', icon: 'none' });
        } else {
          wx.showToast({ title: (res && res.error) || '生成失败，请重试', icon: 'none' });
        }
      })
      .catch(() => {
        this.setData({ aiLoading: false });
        wx.showToast({ title: '生成失败，请确认后端已启动', icon: 'none' });
      });
  },

  /* ---------------- 转化 CTA ---------------- */
  onGoChat() {
    wx.setStorageSync('kfp_chat_prefill', '我想系统学习韩语，请根据我的水平制定学习建议');
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  /* ---------------- 分享 ---------------- */
  onShareAppMessage() {
    const d = this.data.heroQuotes[0] || data.dailyQuote();
    return {
      title: `「${d.ko}」 ${d.zh} | 一起来学韩剧台词`,
      path: '/pages/quotes/quotes'
    };
  }
});
