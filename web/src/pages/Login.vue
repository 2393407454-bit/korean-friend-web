<script setup>
// 登录页：网页版唯一入口，未登录访问任何页面都会被路由守卫重定向到这里
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../api/client';
import { setSession } from '../utils/storage';

const router = useRouter();

const mode = ref('login'); // login | register
const username = ref('');
const password = ref('');
const password2 = ref('');
const error = ref('');
const busy = ref(false);
const shake = ref(false);

function switchMode(m) {
  if (mode.value === m) return;
  mode.value = m;
  error.value = '';
}

function triggerShake() {
  shake.value = true;
  setTimeout(() => { shake.value = false; }, 400);
}

async function submit() {
  if (busy.value) return;
  const name = username.value.trim();
  const pwd = password.value;
  if (!name || !pwd) {
    error.value = '请输入用户名和密码';
    triggerShake();
    return;
  }
  if (mode.value === 'register') {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
      error.value = '用户名需为 3-20 位字母、数字或下划线';
      triggerShake();
      return;
    }
    if (pwd.length < 6) {
      error.value = '密码至少 6 位';
      triggerShake();
      return;
    }
    if (pwd !== password2.value) {
      error.value = '两次输入的密码不一致';
      triggerShake();
      return;
    }
  }
  busy.value = true;
  error.value = '';
  try {
    const url = mode.value === 'register' ? '/api/auth/register' : '/api/auth/login';
    const res = await post(url, { username: name, password: pwd });
    setSession({ token: res.token, userId: res.userId, username: res.username });
    router.push('/home');
  } catch (e) {
    error.value = e.message || '请求失败，请稍后再试';
    triggerShake();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-blob" aria-hidden="true"></div>

    <div class="brand rise rise-1">
      <div class="brand-mark">
        <span>한</span>
      </div>
      <div class="brand-title">한국어 친구</div>
      <div class="brand-sub">韩语伙伴 · AI 口语教练</div>
    </div>

    <div class="login-card" :class="{ shake: shake }" role="form" aria-label="账号登录">
      <div class="mode-tabs">
        <div class="mode-pill" :style="{ transform: mode === 'login' ? 'translateX(0)' : 'translateX(100%)' }"></div>
        <button class="mode-tab" :class="{ 'mode-on': mode === 'login' }" @click="switchMode('login')">登录</button>
        <button class="mode-tab" :class="{ 'mode-on': mode === 'register' }" @click="switchMode('register')">注册</button>
      </div>

      <div class="field">
        <label class="field-label">用户名</label>
        <input
          v-model="username"
          class="field-input"
          type="text"
          placeholder="3-20 位字母、数字或下划线"
          autocomplete="username"
          @keyup.enter="submit"
        />
      </div>
      <div class="field">
        <label class="field-label">密码</label>
        <input
          v-model="password"
          class="field-input"
          type="password"
          placeholder="至少 6 位"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          @keyup.enter="submit"
        />
      </div>
      <div v-show="mode === 'register'" class="field field-reveal">
        <label class="field-label">确认密码</label>
        <input
          v-model="password2"
          class="field-input"
          type="password"
          placeholder="再输入一次密码"
          autocomplete="new-password"
          @keyup.enter="submit"
        />
      </div>

      <div v-if="error" class="login-error" role="alert">
        <span class="error-dot"></span>
        {{ error }}
      </div>

      <button class="submit-btn" :class="{ 'is-off': busy }" :disabled="busy" @click="submit">
        <span v-if="busy" class="spinner" aria-hidden="true"></span>
        <span v-else>{{ mode === 'register' ? '注册并开始学习' : '登录' }}</span>
      </button>

      <div class="login-hint">
        {{ mode === 'register'
          ? '注册后你的学习档案独立保存，与小程序账号互不相通'
          : '还没有账号？切换到「注册」创建一个' }}
      </div>
    </div>

    <div class="login-foot rise rise-3">오늘도 수고했어요 · 今天也加油</div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background:
    radial-gradient(ellipse at 20% 10%, rgba(11, 107, 232, 0.08) 0%, transparent 45%),
    radial-gradient(ellipse at 85% 80%, rgba(11, 107, 232, 0.06) 0%, transparent 40%),
    var(--bg);
  position: relative;
  overflow: hidden;
}

.login-blob {
  position: absolute;
  width: 520px;
  height: 520px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(11, 107, 232, 0.05) 0%, transparent 70%);
  filter: blur(40px);
  pointer-events: none;
}

.brand { text-align: center; margin-bottom: 36px; position: relative; z-index: 1; }
.brand-mark {
  width: 58px;
  height: 58px;
  margin: 0 auto 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--accent), var(--accent-deep));
  color: #fff;
  font-size: 28px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(11, 107, 232, 0.24);
  position: relative;
  overflow: hidden;
}
.brand-mark::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.18), transparent 50%);
}
.brand-mark span { position: relative; z-index: 1; }
.brand-title {
  font-size: 27px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.brand-sub { margin-top: 7px; font-size: 13px; color: var(--ink-3); letter-spacing: 0.04em; }

.login-card {
  width: 100%;
  max-width: 360px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(20, 21, 25, 0.06);
  border-radius: var(--radius-l);
  box-shadow:
    0 1px 2px rgba(20, 21, 25, 0.04),
    0 24px 60px rgba(20, 21, 25, 0.08);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  padding: 22px 22px 18px;
  position: relative;
  z-index: 1;
  transition: transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.login-card.shake {
  animation: card-shake 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes card-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

.mode-tabs {
  position: relative;
  display: flex;
  background: var(--surface-2);
  border-radius: var(--radius-pill);
  padding: 3px;
  margin-bottom: 22px;
}
.mode-pill {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  background: var(--surface);
  border-radius: var(--radius-pill);
  box-shadow: 0 1px 4px rgba(20, 21, 25, 0.08);
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
  z-index: 0;
}
.mode-tab {
  position: relative;
  z-index: 1;
  flex: 1;
  text-align: center;
  padding: 8px 0;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-3);
  cursor: pointer;
  transition: color 0.25s ease;
}
.mode-on { color: var(--ink); }

.field { margin-bottom: 15px; }
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  margin-bottom: 6px;
}
.field-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--radius-m);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: 15px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  outline: none;
}
.field-input::placeholder { color: var(--ink-3); }
.field-input:hover { border-color: var(--line-2); }
.field-input:focus {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.field-reveal {
  animation: field-in 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes field-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 12px;
  padding: 9px 12px;
  border-radius: var(--radius-m);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
  line-height: 1.5;
  animation: error-in 0.25s ease both;
}
@keyframes error-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.error-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger);
  flex-shrink: 0;
}

.submit-btn {
  width: 100%;
  margin-top: 6px;
  padding: 13px 0;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  transition: transform 0.18s ease, opacity 0.18s ease, box-shadow 0.2s ease;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
  overflow: hidden;
}
.submit-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}
.submit-btn:hover::after { transform: translateX(100%); }
.submit-btn:hover:not(:disabled) { box-shadow: 0 8px 20px rgba(20, 21, 25, 0.18); }
.submit-btn:active:not(:disabled) { transform: scale(0.98); opacity: .92; }
.submit-btn.is-off { opacity: .7; cursor: not-allowed; }

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.login-hint { margin-top: 14px; text-align: center; font-size: 12px; color: var(--ink-3); line-height: 1.5; }

.login-foot { margin-top: 32px; font-size: 12px; color: var(--ink-3); letter-spacing: 0.06em; position: relative; z-index: 1; }

.rise {
  opacity: 0;
  animation: rise-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}
.rise-1 { animation-delay: 0.05s; }
.rise-2 { animation-delay: 0.15s; }
.rise-3 { animation-delay: 0.25s; }
@keyframes rise-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .rise,
  .login-card,
  .mode-pill,
  .field-reveal,
  .login-error,
  .spinner {
    animation: none;
    transition: none;
  }
  .rise { opacity: 1; }
}
</style>
