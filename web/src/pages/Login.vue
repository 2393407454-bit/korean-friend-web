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
const showPassword = ref(false);
const showPassword2 = ref(false);
const error = ref('');
const busy = ref(false);
const shake = ref(false);

function switchMode(m) {
  if (mode.value === m) return;
  mode.value = m;
  error.value = '';
  showPassword.value = false;
  showPassword2.value = false;
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
    <div class="hangul-watermark" aria-hidden="true">가나다</div>

    <main class="login-wrap">
      <header class="brand rise rise-1">
        <div class="brand-mark" aria-hidden="true">한</div>
        <div class="brand-copy">
          <div class="brand-title">한국어 친구</div>
          <div class="brand-sub">韩语伙伴 · AI 口语教练</div>
        </div>
        <div class="brand-index" aria-hidden="true">STUDY<br><span>NO. 01</span></div>
      </header>

      <section class="login-intro rise rise-2" aria-labelledby="login-title">
        <div class="intro-kicker">YOUR PRACTICE SPACE</div>
        <Transition name="mode-copy" mode="out-in">
          <div :key="mode" class="mode-copy">
            <h1 id="login-title">{{ mode === 'register' ? '从今天开始练习' : '欢迎回来' }}</h1>
            <p>{{ mode === 'register' ? '创建账号，保存你的韩语学习进度。' : '登录后，继续你的韩语表达练习。' }}</p>
          </div>
        </Transition>
      </section>

      <form class="login-card" :class="{ shake: shake }" aria-label="账号登录" @submit.prevent="submit">
        <div class="mode-tabs" role="group" aria-label="登录或注册">
          <div class="mode-pill" :style="{ transform: mode === 'login' ? 'translateX(0)' : 'translateX(100%)' }"></div>
          <button type="button" :aria-pressed="mode === 'login'" class="mode-tab" :class="{ 'mode-on': mode === 'login' }" @click="switchMode('login')">登录</button>
          <button type="button" :aria-pressed="mode === 'register'" class="mode-tab" :class="{ 'mode-on': mode === 'register' }" @click="switchMode('register')">注册</button>
        </div>

        <div class="field">
          <label class="field-label" for="login-username">用户名</label>
          <input
            id="login-username"
            v-model="username"
            class="field-input"
            type="text"
            placeholder="3-20 位字母、数字或下划线"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
          />
        </div>
        <div class="field">
          <label class="field-label" for="login-password">密码</label>
          <div class="password-input-wrap">
            <input
              id="login-password"
              v-model="password"
              class="field-input has-toggle"
              :type="showPassword ? 'text' : 'password'"
              placeholder="至少 6 位"
              :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.7" />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.2 0 9.5 6 9.5 6a15 15 0 0 1-3 3.7M6.2 6.3C3.8 8 2.5 12 2.5 12s3.3 6 9.5 6c1 0 1.9-.2 2.7-.5" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </svg>
            </button>
          </div>
        </div>
        <div v-show="mode === 'register'" class="field field-reveal">
          <label class="field-label" for="login-password-confirm">确认密码</label>
          <div class="password-input-wrap">
            <input
              id="login-password-confirm"
              v-model="password2"
              class="field-input has-toggle"
              :type="showPassword2 ? 'text' : 'password'"
              placeholder="再输入一次密码"
              autocomplete="new-password"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPassword2 ? '隐藏确认密码' : '显示确认密码'"
              :aria-pressed="showPassword2"
              @click="showPassword2 = !showPassword2"
            >
              <svg v-if="!showPassword2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.7" />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.2 0 9.5 6 9.5 6a15 15 0 0 1-3 3.7M6.2 6.3C3.8 8 2.5 12 2.5 12s3.3 6 9.5 6c1 0 1.9-.2 2.7-.5" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </svg>
            </button>
          </div>
          <p v-if="password2" class="match-note" :class="password === password2 ? 'is-match' : 'is-mismatch'" aria-live="polite">
            <span class="match-dot" aria-hidden="true"></span>
            {{ password === password2 ? '两次密码已匹配' : '两次密码尚未一致' }}
          </p>
        </div>

        <div v-if="error" class="login-error" role="alert">
          <span class="error-dot"></span>
          {{ error }}
        </div>

        <button type="submit" class="submit-btn" :class="{ 'is-off': busy }" :disabled="busy">
          <span v-if="busy" class="spinner" aria-hidden="true"></span>
          <span v-else>{{ mode === 'register' ? '注册并开始学习' : '登录' }}</span>
        </button>

        <p class="login-hint">
          {{ mode === 'register'
            ? '学习档案独立保存，与小程序账号互不相通'
            : '新用户？切换到「注册」创建账号' }}
        </p>
      </form>

      <footer class="login-foot rise rise-3">
        <span class="foot-rule" aria-hidden="true"></span>
        <span>오늘도 수고했어요 · 今天也加油</span>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: safe center;
  justify-content: center;
  padding: clamp(28px, 7vh, 56px) 22px;
  background: var(--bg);
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.hangul-watermark {
  position: absolute;
  right: -0.2em;
  bottom: 2.5%;
  color: var(--ink);
  opacity: 0.035;
  font-size: clamp(76px, 19vw, 112px);
  font-weight: 800;
  letter-spacing: -0.12em;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

.login-wrap {
  width: 100%;
  max-width: 392px;
  position: relative;
  z-index: 1;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: clamp(34px, 6vh, 48px);
}
.brand-mark {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(11, 107, 232, 0.12);
  border-radius: 13px;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.06em;
}
.brand-copy { min-width: 0; }
.brand-title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.025em;
  line-height: 1.35;
}
.brand-sub { margin-top: 3px; color: var(--ink-3); font-size: 11px; letter-spacing: 0.015em; }
.brand-index {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 9px;
  font-weight: 650;
  line-height: 1.65;
  letter-spacing: 0.11em;
  text-align: right;
}
.brand-index span { color: var(--ink-2); }

.login-intro { margin-bottom: 22px; }
.intro-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--accent-deep);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.13em;
}
.intro-kicker::before { content: ''; width: 18px; height: 1px; background: var(--accent); }
.login-intro h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(27px, 7vw, 32px);
  font-weight: 760;
  letter-spacing: -0.055em;
  line-height: 1.2;
}
.login-intro p {
  margin: 9px 0 0;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.65;
}
.mode-copy-enter-active,
.mode-copy-leave-active { transition: opacity 0.16s ease, transform 0.16s ease; }
.mode-copy-enter-from,
.mode-copy-leave-to { opacity: 0; transform: translateY(4px); }

.login-card {
  width: 100%;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(20, 21, 25, 0.045);
  transition: transform 0.3s ease;
}
.login-card.shake { animation: card-shake 0.4s ease-out; }
@keyframes card-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

.mode-tabs {
  position: relative;
  display: flex;
  padding: 3px;
  margin-bottom: 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #F8F8F6;
}
.mode-pill {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  transition: transform 0.24s ease-out;
  z-index: 0;
}
.mode-tab {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 40px;
  border-radius: 9px;
  color: var(--ink-3);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.18s ease;
}
.mode-on { color: var(--ink); }
.mode-tab:focus-visible,
.submit-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.field { margin-bottom: 15px; }
.field-label {
  display: block;
  margin-bottom: 7px;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 650;
}
.field-input {
  width: 100%;
  min-height: 50px;
  padding: 12px 13px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #FAFAF8;
  color: var(--ink);
  font-size: 16px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.field-input::placeholder { color: #777A80; opacity: 1; }
.field-input:hover { border-color: var(--line-2); }
.field-input:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.password-input-wrap { position: relative; }
.field-input.has-toggle { padding-right: 58px; }
.password-toggle {
  position: absolute;
  top: 50%;
  right: 4px;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 8px;
  color: var(--ink-3);
  transform: translateY(-50%);
  transition: color 0.16s ease, background 0.16s ease, scale 0.12s ease;
}
.password-toggle:hover { color: var(--ink); background: var(--surface-2); }
.password-toggle:active { scale: 0.94; }
.password-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.password-toggle svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.match-note {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 7px 1px 0;
  color: var(--danger);
  font-size: 12px;
  line-height: 1.4;
  transition: color 0.16s ease;
}
.match-note.is-match { color: var(--ok); }
.match-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: currentColor; }

.field-reveal { animation: field-in 0.24s ease-out both; }
@keyframes field-in {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 9px 11px;
  border: 1px solid rgba(196, 61, 56, 0.12);
  border-radius: 10px;
  background: var(--danger-soft);
  color: #9F302D;
  font-size: 13px;
  line-height: 1.5;
  animation: error-in 0.2s ease-out both;
}
@keyframes error-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
.error-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: var(--danger); }

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 50px;
  margin-top: 5px;
  border: 1px solid var(--ink);
  border-radius: 11px;
  background: var(--ink);
  color: #fff;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}
.submit-btn:hover:not(:disabled) { background: #292A2F; box-shadow: 0 5px 14px rgba(20, 21, 25, 0.12); }
.submit-btn:active:not(:disabled) { transform: scale(0.985); }
.submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }

.spinner {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(255, 255, 255, 0.32);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.login-hint {
  margin: 13px 2px 0;
  color: #70737A;
  font-size: 12px;
  line-height: 1.55;
  text-align: center;
}
.login-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 25px;
  color: var(--ink-3);
  font-size: 11px;
  letter-spacing: 0.035em;
}
.foot-rule { width: 22px; height: 1px; background: var(--line-2); }

.rise {
  opacity: 0;
  animation: rise-in 0.48s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}
.rise-1 { animation-delay: 0.03s; }
.rise-2 { animation-delay: 0.09s; }
.rise-3 { animation-delay: 0.15s; }
@keyframes rise-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 360px) {
  .login-page { padding-right: 16px; padding-left: 16px; }
  .login-card { padding: 15px; }
  .brand { margin-bottom: 30px; }
  .login-intro h1 { font-size: 27px; }
}

@media (max-height: 700px) {
  .login-page { align-items: flex-start; padding-top: 24px; padding-bottom: 24px; }
  .brand { margin-bottom: 26px; }
  .login-foot { margin-top: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .rise,
  .login-card,
  .mode-pill,
  .field-reveal,
  .login-error,
  .spinner,
  .mode-copy-enter-active,
  .mode-copy-leave-active,
  .password-toggle,
  .match-note { animation: none; transition: none; }
  .rise { opacity: 1; }
}
</style>
