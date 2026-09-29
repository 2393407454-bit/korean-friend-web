import { getSession, clearSession } from '../utils/storage';

// 后端地址：默认同源（dev 由 Vite 代理，prod 由 Express 托管 web/dist）
const BASE = import.meta.env.VITE_API_BASE || '';

// AI 排队/限流时单次请求可能接近 2 分钟，与小程序端保持 120s
const TIMEOUT = 120000;

function onUnauthorized() {
  clearSession();
  // 动态引入避免与 router 循环依赖；会话过期回到登录页
  import('../router').then((m) => m.default.push('/login')).catch(() => {
    window.location.href = '/login';
  });
}

async function request(url, { method = 'GET', body, formData, timeout = TIMEOUT } = {}) {
  const { token } = getSession();
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  let res;
  try {
    res = await fetch(BASE + url, {
      method,
      headers,
      body: formData ? formData : (body !== undefined ? JSON.stringify(body) : undefined),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error('连不上后端，请确认服务已启动');
  }
  clearTimeout(timer);

  let data = null;
  try {
    data = await res.json();
  } catch (e) { /* 非 JSON 响应保持 null */ }

  if (res.status === 401) {
    onUnauthorized();
    throw Object.assign(new Error((data && data.error) || '登录已过期'), { status: 401 });
  }
  if (!res.ok) {
    throw Object.assign(new Error((data && data.error) || ('请求失败（' + res.status + '）')), { status: res.status, data });
  }
  return data;
}

export function get(url, timeout) {
  return request(url, { method: 'GET', timeout });
}

export function post(url, data, timeout) {
  return request(url, { method: 'POST', body: data, timeout });
}

// 文件上传：multipart/form-data（对应 wx.uploadFile，字段名固定 file）
export function uploadFile(url, file, fields = {}, timeout = TIMEOUT) {
  const fd = new FormData();
  fd.append('file', file);
  Object.keys(fields).forEach((k) => {
    if (fields[k] !== undefined && fields[k] !== null) fd.append(k, fields[k]);
  });
  return request(url, { method: 'POST', formData: fd, timeout });
}
