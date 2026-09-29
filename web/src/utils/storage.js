// 本地存储：沿用小程序的 key 命名（wx.setStorageSync ↔ localStorage）
// 额外增加网页版登录态（kfp_web_token / kfp_web_uid / kfp_web_username）

export function storeGet(key, fallback = '') {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function storeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* 存储满等异常静默 */ }
}

export function storeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) { /* 忽略 */ }
}

/* ---------------- 登录态 ---------------- */
const TOKEN_KEY = 'kfp_web_token';
const UID_KEY = 'kfp_web_uid';
const NAME_KEY = 'kfp_web_username';

export function getSession() {
  return {
    token: storeGet(TOKEN_KEY, ''),
    userId: storeGet(UID_KEY, ''),
    username: storeGet(NAME_KEY, '')
  };
}

export function setSession({ token, userId, username }) {
  storeSet(TOKEN_KEY, token);
  storeSet(UID_KEY, userId);
  storeSet(NAME_KEY, username);
}

export function clearSession() {
  storeRemove(TOKEN_KEY);
  storeRemove(UID_KEY);
  storeRemove(NAME_KEY);
}

export function isLogged() {
  return !!storeGet(TOKEN_KEY, '');
}

// 当前登录用户的 uid（= 学习档案 ID，web_<username>）
export function currentUid() {
  return storeGet(UID_KEY, '');
}
