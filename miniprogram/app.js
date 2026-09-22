const config = require('./utils/config');

App({
  globalData: {
    userId: '',
    userReady: false,
    userReadyPromise: null,
    recorderOwner: null,
    serverCaps: { llm: false, asr: false, tts: false }
  },

  onLaunch() {
    this.globalData.userReadyPromise = this.ensureUserId();
    this.loadServerCaps();
  },

  // 账号体系：后端配置了 appid/secret 时用 code2Session 换 openid 作稳定 uid（按微信账号隔离数据）；
  // 未配置时退回本地设备号。uid 变更（如填入 secret 后首次微信登录）时通知各页重载数据。
  ensureUserId() {
    // 先分配本地临时 UID，让首屏有稳定标识；后续等微信会话完成后再切换为 wx_ UID。
    let uid = wx.getStorageSync('kfp_uid_v2');
    if (!uid) {
      uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      wx.setStorageSync('kfp_uid_v2', uid);
    }
    this.globalData.userId = uid;
    this.globalData.userReady = false;

    return new Promise((resolve) => {
      const finish = (serverUid) => {
        if (serverUid && serverUid !== this.globalData.userId) {
          wx.setStorageSync('kfp_uid_v2', serverUid);
          this.globalData.userId = serverUid;
          if (typeof this.onUidChanged === 'function') this.onUidChanged(serverUid);
          else this._pendingUidChange = true;
        }
        this.globalData.userReady = true;
        resolve(this.globalData.userId);
      };

      wx.login({
        success: (res) => {
          wx.request({
            url: config.BASE_URL + '/api/session',
            method: 'POST',
            data: { code: res.code || '', deviceId: uid },
            timeout: 10000,
            success: (r) => finish(r.data && r.data.userId),
            fail: () => finish('')
          });
        },
        fail: () => finish('')
      });
    });
  },

  whenUserReady() {
    if (this.globalData.userReady) return Promise.resolve(this.globalData.userId);
    return this.globalData.userReadyPromise || Promise.resolve(this.globalData.userId);
  },

  loadServerCaps() {
    wx.request({
      url: config.BASE_URL + '/api/health',
      success: (res) => {
        if (res.data) this.globalData.serverCaps = res.data;
      }
    });
  }
});
