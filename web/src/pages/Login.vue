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

function switchMode(m) {
  mode.value = m;
  error.value = '';
}

async function submit() {
  if (busy.value) return;
  const name = username.value.trim();
  const pwd = password.value;
  if (!name || !pwd) {
    error.value = '请输入用户名和密码';
    return;
  }
  if (mode.value === 'register') {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
      error.value = '用户名需为 3-20 位字母、数字或下划线';
      return;
    }
    if (pwd.length < 6) {
      error.value = '密码至少 6 位';
      return;
    }
    if (pwd !== password2.value) {
      error.value = '两次输入的密码不一致';
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
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="brand rise rise-1">
      <div class="brand-mark">한</div>
      <div class="brand-title">한국어 친구</div>
      <div class="brand-sub">韩语伙伴 · AI 口语教练</div>
    </div>

    <div class="login-card rise rise-2">
      <div class="mode-tabs">
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
      <div v-if="mode === 'register'" class="field">
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

      <div v-if="error" class="login-error">{{ error }}</div>

      <button class="submit-btn" :class="{ 'is-off': busy }" @click="submit">
        {{ busy ? '请稍候…' : (mode === 'register' ? '注册并开始学习' : '登录') }}
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
  background: var(--bg);
}

.brand { text-align: center; margin-bottom: 32px; }
.brand-mark {
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  border-radius: 15px;
  background: var(--accent);
  color: #fff;
  font-size: 26px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(11, 107, 232, 0.28);
}
.brand-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.brand-sub { margin-top: 6px; font-size: 13px; color: var(--ink-3); letter-spacing: 0.04em; }

.login-card {
  width: 100%;
  max-width: 360px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-l);
  box-shadow: var(--shadow-card);
  padding: 20px 20px 16px;
}

.mode-tabs {
  display: flex;
  background: var(--surface-2);
  border-radius: var(--radius-pill);
  padding: 3px;
  margin-bottom: 20px;
}
.mode-tab {
  flex: 1;
  text-align: center;
  padding: 7px 0;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-3);
  cursor: pointer;
  transition: all .2s ease;
}
.mode-on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 4px rgba(20,21,25,.10); }

.field { margin-bottom: 14px; }
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  margin-bottom: 6px;
}

.login-error {
  margin: 2px 0 10px;
  padding: 8px 12px;
  border-radius: var(--radius-m);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
  line-height: 1.5;
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
  transition: all .18s ease;
  cursor: pointer;
}
.submit-btn:active { transform: scale(0.98); opacity: .92; }
.submit-btn.is-off { opacity: .6; }

.login-hint { margin-top: 12px; text-align: center; font-size: 12px; color: var(--ink-3); line-height: 1.5; }

.login-foot { margin-top: 30px; font-size: 12px; color: #B9BAC0; letter-spacing: 0.06em; }
</style>
