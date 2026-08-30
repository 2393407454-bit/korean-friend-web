const config = require('./utils/config');

// 同声传译插件仅支持中英文，作韩语场景的降级方案（未添加插件时不影响主流程）
let WechatSI = null;
try {
  WechatSI = requirePlugin('WechatSI');
} catch (e) {
  console.warn('[app] 未添加同声传译插件，中文语音降级不可用：', e && e.message);
}

App({
  globalData: {
    WechatSI,
    userId: '',
    serverCaps: { llm: false, asr: false, tts: false }
  },

  onLaunch() {
    this.ensureUserId();
    this.loadServerCaps();
  },

  // 账号体系：后端配置了 appid/secret 时用 code2Session 换 openid 作稳定 uid（按微信账号隔离数据）；
  // 未配置时退回本地设备号。uid 变更（如填入 secret 后首次微信登录）时通知各页重载数据。
  ensureUserId() {
    // v2 key：与旧测试数据彻底隔离，每个新账号开局都是初始形态
    let uid = wx.getStorageSync('kfp_uid_v2');
    if (!uid) {
      uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      wx.setStorageSync('kfp_uid_v2', uid);
    }
    this.globalData.userId = uid;
    wx.login({
      success: (res) => {
        wx.request({
          url: config.BASE_URL + '/api/session',
          method: 'POST',
          data: { code: res.code || '', deviceId: uid },
          success: (r) => {
            const serverUid = r.data && r.data.userId;
            if (serverUid && serverUid !== uid) {
              wx.setStorageSync('kfp_uid_v2', serverUid);
              this.globalData.userId = serverUid;
              // uid 变更（微信登录接管）→ 通知页面按新账号重载
              if (typeof this.onUidChanged === 'function') this.onUidChanged(serverUid);
              else this._pendingUidChange = true;
            }
          }
        });
      }
    });
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
