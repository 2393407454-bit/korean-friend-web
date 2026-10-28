<script setup>
// 登录页：网页版唯一入口，未登录访问任何页面都会被路由守卫重定向到这里
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../api/client';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const mode = ref('login'); // login | register
const username = ref('');
const password = ref('');
const password2 = ref('');
const showPassword = ref(false);
const showPassword2 = ref(false);
const error = ref('');
const busy = ref(false);
const shake = ref(false);
const welcome = ref(false);
const welcomeName = ref('');

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
    auth.signIn(res);
    welcomeName.value = name;
    welcome.value = true;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 0 : 1350));
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

    <main class="login-wrap login-layout">
      <section class="editorial-cover" aria-label="首尔学习期刊封面">
        <img src="/images/seoul-editorial.webp" alt="清晨的首尔韩屋屋顶与城市天际线" fetchpriority="high" />
        <div class="editorial-top"><span>한국어 친구</span><span>VOL. 01</span></div>
        <div class="editorial-title">
          <span>THE SEOUL</span>
          <strong>SPEAKING<br />JOURNAL</strong>
        </div>
        <div class="editorial-bottom">
          <span>一座城市，一种语言，<br />从今天开始练习。</span>
          <span>37°34′N<br />126°58′E</span>
        </div>
      </section>

      <div class="login-panel">
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

      <router-link class="project-link" to="/project">了解这个韩语学习作品 <span aria-hidden="true">↗</span></router-link>
      </div>
    </main>

    <Transition name="welcome">
      <div v-if="welcome" class="welcome-screen" role="status" aria-live="polite">
        <div class="welcome-magazine">
          <div class="welcome-visual" aria-hidden="true">
            <img src="/images/seoul-editorial.webp" alt="" />
            <span>THE NEXT<br />CHAPTER</span>
            <b>01</b>
          </div>
          <div class="welcome-card">
            <div class="welcome-index">SEOUL · STUDY JOURNAL <span>NO. 01</span></div>
            <div class="welcome-stamp" aria-hidden="true">한</div>
            <div class="welcome-kicker">오늘의 한국어 여정</div>
            <h2>{{ welcomeName }}，<br />欢迎回来</h2>
            <p>正在为你翻开今天的练习期刊</p>
            <div class="welcome-route"><i></i><i></i><i></i><i></i><b></b></div>
            <div class="welcome-caption">YOUR NEXT CHAPTER STARTS HERE</div>
          </div>
        </div>
      </div>
    </Transition>
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

.welcome-screen {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
  color: #f7f3e9;
  background: radial-gradient(ellipse at 50% 38%, #274763 0%, #142b3b 45%, #0e1d29 100%);
}
.welcome-screen::before,
.welcome-screen::after {
  content: '';
  position: absolute;
  width: min(90vw, 560px);
  aspect-ratio: 1;
  border: 1px solid rgba(228, 190, 126, .22);
  border-radius: 50%;
  animation: welcome-orbit 5s linear infinite;
}
.welcome-screen::after { width: min(68vw, 420px); animation-duration: 7s; animation-direction: reverse; }
.welcome-orbit { position: absolute; inset: 0; opacity: .48; }
.welcome-orbit span { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #e9bc7d; box-shadow: 0 0 18px 5px rgba(233,188,125,.35); }
.welcome-orbit span:nth-child(1) { top: 18%; left: 22%; }
.welcome-orbit span:nth-child(2) { right: 18%; top: 33%; width: 3px; height: 3px; }
.welcome-orbit span:nth-child(3) { bottom: 17%; left: 31%; width: 4px; height: 4px; }
.welcome-card {
  position: relative;
  z-index: 1;
  width: min(100%, 370px);
  padding: 27px 27px 25px;
  color: #172a36;
  background: #f2ecdf;
  border: 1px solid rgba(255,255,255,.7);
  border-radius: 3px;
  box-shadow: 0 26px 80px rgba(0,0,0,.34);
  transform: rotate(-1.2deg);
}
.welcome-index { display: flex; justify-content: space-between; padding-bottom: 13px; border-bottom: 1px solid rgba(23,42,54,.18); color: #69736f; font-size: 9px; letter-spacing: .16em; }
.welcome-index span { color: #a9783d; }
.welcome-stamp { width: 48px; height: 48px; display: grid; place-items: center; margin: 26px 0 18px; border: 1px solid #b17d43; border-radius: 50%; color: #a56e34; font-size: 22px; transform: rotate(7deg); }
.welcome-kicker { color: #9a6c38; font-size: 10px; letter-spacing: .2em; }
.welcome-card h2 { margin: 7px 0 5px; font-size: 23px; line-height: 1.35; letter-spacing: -.04em; }
.welcome-card p { margin: 0; color: #647078; font-size: 12px; }
.welcome-route { position: relative; display: flex; justify-content: space-between; align-items: center; margin: 27px 0 12px; }
.welcome-route::before { content: ''; position: absolute; left: 3px; right: 3px; top: 50%; border-top: 1px dashed #b78a58; }
.welcome-route i, .welcome-route b { position: relative; width: 8px; height: 8px; border: 1.5px solid #a9783d; border-radius: 50%; background: #f2ecdf; }
.welcome-route b { width: 12px; height: 12px; background: #a9783d; box-shadow: 0 0 0 4px rgba(169,120,61,.14); }
.welcome-caption { color: #818986; font-size: 8px; letter-spacing: .18em; }
@keyframes welcome-orbit { to { transform: rotate(360deg); } }
.welcome-enter-active, .welcome-leave-active { transition: opacity .28s ease, transform .42s cubic-bezier(.2,.75,.2,1); }
.welcome-enter-from { opacity: 0; transform: scale(1.04); }
.welcome-leave-to { opacity: 0; transform: scale(.98); }

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
.project-link {
  display: block;
  width: fit-content;
  margin: 18px auto 0;
  color: var(--ink-3);
  font-size: 12px;
  transition: color .2s ease;
}
.project-link span { margin-left: 3px; color: var(--accent); }
.project-link:hover { color: var(--accent-deep); }
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
  .welcome-screen::before, .welcome-screen::after { animation: none; }
  .welcome-enter-active, .welcome-leave-active { transition: none; }
}

/* 2026 现代韩系杂志：城市封面 + 登录内页 */
.login-page { display: block; padding: 0; background: #f3f1eb; }
.login-layout { width: 100%; max-width: none; min-height: 100dvh; }
.editorial-cover {
  position: relative;
  height: 196px;
  overflow: hidden;
  color: #f8f5ec;
  background: #5e5a4c;
}
.editorial-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,25,24,.3), transparent 42%, rgba(20,25,24,.66)); }
.editorial-cover img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 57%; }
.editorial-top, .editorial-bottom, .editorial-title { position: absolute; z-index: 1; left: 22px; right: 22px; }
.editorial-top { top: 18px; display: flex; justify-content: space-between; padding-bottom: 9px; border-bottom: 1px solid rgba(255,255,255,.65); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
.editorial-title { top: 53px; display: flex; flex-direction: column; }
.editorial-title span { font-size: 10px; letter-spacing: .24em; }
.editorial-title strong { margin-top: 3px; font-family: var(--font-display); font-size: 32px; font-weight: 500; line-height: .94; letter-spacing: -.045em; }
.editorial-bottom { bottom: 17px; display: flex; align-items: flex-end; justify-content: space-between; font-size: 9px; line-height: 1.6; letter-spacing: .06em; }
.editorial-bottom span:last-child { text-align: right; font-size: 8px; letter-spacing: .12em; }
.login-panel { width: 100%; max-width: 440px; margin: 0 auto; padding: 28px 22px 32px; }
.login-panel .brand { margin-bottom: 30px; }
.login-panel .brand-mark { border-radius: 50%; background: transparent; border-color: var(--ink); color: var(--ink); }
.login-panel .login-card { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.login-panel .login-intro h1 { font-family: var(--font-display); font-size: 38px; font-weight: 600; letter-spacing: -.065em; }
.login-panel .mode-tabs { border-radius: 0; border-width: 0 0 1px; padding: 0 0 8px; background: transparent; }
.login-panel .mode-pill { top: auto; bottom: -1px; left: 0; width: 50%; height: 2px; border: 0; border-radius: 0; background: var(--ink); }
.login-panel .mode-tab { min-height: 44px; }
.login-panel .field-input { border-width: 0 0 1px; border-radius: 0; background: transparent; padding-left: 0; }
.login-panel .field-input:focus { box-shadow: none; background: transparent; }
.login-panel .submit-btn { min-height: 52px; border-radius: 0; background: #202725; }
.login-panel .login-foot { margin-top: 28px; }

.welcome-screen { background: #e9e5db; }
.welcome-screen::before, .welcome-screen::after, .welcome-orbit { display: none; }
.welcome-magazine {
  position: relative;
  width: min(100%, 390px);
  min-height: 520px;
  display: grid;
  overflow: hidden;
  background: #f5f1e7;
  box-shadow: 0 32px 80px rgba(38,43,39,.22);
  transform-origin: left center;
}
.welcome-magazine::after { content: ''; position: absolute; inset: 0 auto 0 0; width: 8px; background: #223836; z-index: 3; }
.welcome-visual { display: none; position: relative; overflow: hidden; color: #f8f5ec; }
.welcome-visual::after { content: ''; position: absolute; inset: 0; background: rgba(24,34,31,.28); }
.welcome-visual img { width: 100%; height: 100%; object-fit: cover; }
.welcome-visual span { position: absolute; z-index: 1; left: 28px; bottom: 34px; font-family: var(--font-display); font-size: 38px; line-height: .98; }
.welcome-visual b { position: absolute; z-index: 1; right: 22px; top: 24px; font-family: var(--font-display); font-size: 46px; font-weight: 400; }
.welcome-magazine .welcome-card { width: 100%; padding: 34px 30px; border: 0; border-radius: 0; background: #f5f1e7; box-shadow: none; transform: none; }
.welcome-magazine .welcome-card h2 { margin-top: 12px; font-family: var(--font-display); font-size: 32px; font-weight: 600; letter-spacing: -.055em; }
.welcome-magazine .welcome-stamp { border-radius: 0; transform: rotate(-5deg); }
.welcome-enter-active .welcome-magazine { animation: magazine-open .85s cubic-bezier(.16,1,.3,1) both; }
.welcome-enter-active .welcome-card > * { animation: welcome-copy .55s .34s cubic-bezier(.16,1,.3,1) both; }
.welcome-enter-active .welcome-card > *:nth-child(2) { animation-delay: .4s; }
.welcome-enter-active .welcome-card > *:nth-child(3) { animation-delay: .46s; }
.welcome-enter-active .welcome-card > *:nth-child(4) { animation-delay: .52s; }
.welcome-enter-active .welcome-card > *:nth-child(5) { animation-delay: .58s; }
.welcome-leave-active .welcome-magazine { transform: translateX(-18px) rotateY(-5deg); opacity: 0; transition: transform .28s ease-in, opacity .24s ease-in; }
@keyframes magazine-open { from { opacity: 0; transform: perspective(1300px) rotateY(-24deg) translateX(50px); } to { opacity: 1; transform: perspective(1300px) rotateY(0) translateX(0); } }
@keyframes welcome-copy { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

@media (min-width: 760px) {
  .login-layout { display: grid; grid-template-columns: minmax(360px, 1.06fr) minmax(420px, .94fr); }
  .editorial-cover { height: 100dvh; min-height: 640px; position: sticky; top: 0; }
  .editorial-cover img { object-position: 50% 54%; }
  .editorial-top, .editorial-bottom, .editorial-title { left: clamp(30px, 4vw, 64px); right: clamp(30px, 4vw, 64px); }
  .editorial-top { top: 36px; font-size: 11px; }
  .editorial-title { top: auto; bottom: 128px; }
  .editorial-title span { font-size: 12px; }
  .editorial-title strong { font-size: clamp(56px, 6.6vw, 98px); }
  .editorial-bottom { bottom: 38px; font-size: 11px; }
  .login-panel { max-width: 500px; padding: 48px 56px; }
  .login-panel .login-intro h1 { font-size: 46px; }
  .welcome-magazine { width: min(86vw, 860px); min-height: 560px; grid-template-columns: .9fr 1fr; }
  .welcome-visual { display: block; }
  .welcome-magazine .welcome-card { padding: 42px 40px; align-self: center; }
}
@media (max-width: 360px) {
  .login-panel { padding: 24px 17px 28px; }
  .editorial-cover { height: 174px; }
  .login-panel .brand { margin-bottom: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .welcome-enter-active .welcome-magazine, .welcome-enter-active .welcome-card > * { animation: none; }
  .welcome-leave-active .welcome-magazine { transition: none; transform: none; }
}
</style>
