// 微信内容安全与登录：发布上线前把 ENABLE_WX_SECURITY、WX_APPID、WX_SECRET 配好即可生效，
// 未配置时全部安全通过（开发期不受影响）。
const https = require('https');

let tokenCache = { token: '', expireAt: 0 };

function enabled() {
  return process.env.ENABLE_WX_SECURITY === 'true' && process.env.WX_APPID && process.env.WX_SECRET;
}

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expireAt) return tokenCache.token;
  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    process.env.WX_APPID +
    '&secret=' +
    process.env.WX_SECRET;
  const out = await httpsGet(url);
  if (!out.access_token) throw new Error('获取 access_token 失败: ' + JSON.stringify(out));
  tokenCache = { token: out.access_token, expireAt: Date.now() + (out.expires_in - 300) * 1000 };
  return tokenCache.token;
}

// 用户文本送审；命中风险返回 false
async function checkText(text) {
  if (!enabled() || !text) return true;
  try {
    const token = await getAccessToken();
    const out = await httpsPost('https://api.weixin.qq.com/wxa/msg_sec_check?access_token=' + token, {
      version: 2,
      scene: 2,
      openid: '',
      content: text.slice(0, 2500)
    });
    if (out.errcode === 0 && out.result) return out.result.suggest === 'pass';
    return true; // 检测通道异常时不拦截，避免误伤
  } catch (e) {
    console.warn('[security] msgSecCheck 失败：', e.message);
    return true;
  }
}

// wx.login 的 code 换 openid 作为稳定用户标识；未配置时退回前端 deviceId
async function codeToSession(code, deviceId) {
  if (code && enabled()) {
    const out = await httpsGet(
      'https://api.weixin.qq.com/sns/jscode2session?appid=' +
        process.env.WX_APPID +
        '&secret=' +
        process.env.WX_SECRET +
        '&js_code=' +
        code +
        '&grant_type=authorization_code'
    );
    if (out.openid) return 'wx_' + out.openid;
  }
  if (!deviceId) throw new Error('deviceId required');
  return deviceId;
}

module.exports = { checkText, codeToSession, enabled };
