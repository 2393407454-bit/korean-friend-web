const config = require('./config');

// AI 排队/限流时单次请求可能接近 2 分钟，默认 60s 会中途断开
const TIMEOUT = 120000;

function get(url) {
  return whenReady().then(() => new Promise((resolve, reject) => {
    wx.request({
      url: config.BASE_URL + url,
      method: 'GET',
      timeout: TIMEOUT,
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(res)),
      fail: reject
    });
  }));
}

function post(url, data) {
  return whenReady().then(() => new Promise((resolve, reject) => {
    wx.request({
      url: config.BASE_URL + url,
      method: 'POST',
      data,
      timeout: TIMEOUT,
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(res)),
      fail: reject
    });
  }));
}

// JSON body 里的 base64 帧走 request；文件走 uploadFile
function whenReady() {
  const app = getApp();
  if (app && typeof app.whenUserReady === 'function') return app.whenUserReady();
  return Promise.resolve(app && app.globalData && app.globalData.userId);
}

function uploadFile(url, filePath, formData) {
  return whenReady().then(() => new Promise((resolve, reject) => {
    wx.uploadFile({
      url: config.BASE_URL + url,
      filePath,
      name: 'file',
      formData: formData || {},
      timeout: TIMEOUT,
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          res.statusCode < 400 ? resolve(data) : reject(data);
        } catch (e) {
          reject(e);
        }
      },
      fail: reject
    });
  }));
}

module.exports = { get, post, uploadFile, whenReady };
