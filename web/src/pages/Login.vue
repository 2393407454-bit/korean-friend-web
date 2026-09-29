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
    <!-- 品牌区 -->
    <div class="brand pop pop-1">
      <div class="brand-dots"><span class="bd bd-blue"></span><span class="bd bd-red"></span><span class="bd bd-ink"></span></div>
      <div class="brand-title">한국어 친구</div>
      <div class="brand-sub">韩语伙伴 · AI 沉浸式口语教练</div>
    </div>

    <!-- 登录/注册卡 -->
    <div class="login-card pop pop-2">
      <div class="mode-tabs">
        <div class="mode-tab" :class="{ 'mode-on': mode === 'login' }" @click="switchMode('login')">登录</div>
        <div class="mode-tab" :class="{ 'mode-on': mode === 'register' }" @click="switchMode('register')">注册</div>
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

      <div v-if="error" class="login-error">⚠️ {{ error }}</div>

      <button class="submit-btn" :class="{ 'submit-off': busy }" @click="submit">
        {{ busy ? '请稍候…' : (mode === 'register' ? '注册并开始学习' : '登录') }}
      </button>

      <div class="login-hint">
        {{ mode === 'register'
          ? '注册后你的学习档案独立保存，与迷你程序账号互不相通'
          : '还没有账号？点上方「注册」创建一个' }}
      </div>
    </div>

    <div class="login-foot">오늘도 수고했어요 · 今天也加油</div>
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
    radial-gradient(circle at 85% 8%, rgba(0, 113, 227, 0.08), transparent 45%),
    radial-gradient(circle at 10% 90%, rgba(214, 69, 65, 0.06), transparent 45%),
    #F5F5F7;
}

.brand { text-align: center; margin-bottom: 30px; }
.brand-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 14px; }
.bd { width: 8px; height: 8px; border-radius: 50%; }
.bd-blue { background: var(--c-klein); }
.bd-red { background: var(--c-han-red); }
.bd-ink { background: var(--c-ink); }
.brand-title {
  font-size: 38px;
  font-weight: 900;
  letter-spacing: 1px;
  color: var(--c-ink);
  line-height: 1.2;
}
.brand-sub { margin-top: 8px; font-size: 14px; color: var(--c-mute); letter-spacing: 2px; }

.login-card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 20px;
  box-shadow: var(--shadow-soft);
  padding: 22px 22px 18px;
}

.mode-tabs {
  display: flex;
  background: var(--c-cream);
  border-radius: 999px;
  padding: 4px;
  margin-bottom: 20px;
}
.mode-tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  color: var(--c-mute);
  cursor: pointer;
  transition: all 0.25s ease-out;
}
.mode-on { background: var(--c-klein); color: #fff; box-shadow: 0 2px 8px rgba(0, 113, 227, 0.3); }

.field { margin-bottom: 14px; }
.field-label { display: block; font-size: 12px; font-weight: 700; color: var(--c-ink-soft); margin-bottom: 6px; letter-spacing: 0.5px; }
.field-input {
  width: 100%;
  border: 1.5px solid var(--c-border);
  border-radius: 12px;
  padding: 11px 14px;
  font-size: 15px;
  background: var(--c-paper);
  transition: border 0.2s ease-out, box-shadow 0.2s ease-out;
}
.field-input:focus { border-color: var(--c-klein); box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12); }

.login-error {
  margin: 4px 0 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #FFE9E8;
  color: var(--c-coral);
  font-size: 13px;
  line-height: 1.5;
}

.submit-btn {
  width: 100%;
  margin-top: 8px;
  padding: 13px 0;
  border-radius: 999px;
  background: var(--c-klein);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  box-shadow: 0 4px 14px rgba(0, 113, 227, 0.3);
  transition: all 0.2s ease-out;
  cursor: pointer;
}
.submit-btn:active { transform: scale(0.97); }
.submit-off { opacity: 0.7; }

.login-hint { margin-top: 12px; text-align: center; font-size: 12px; color: var(--c-mute); line-height: 1.5; }

.login-foot { margin-top: 28px; font-size: 12px; color: #B9BAC0; letter-spacing: 1px; }
</style>
