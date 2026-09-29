<script setup>
// 底部 tabBar：与小程序 app.json 的 tabBar 一致（오늘/대화/발음/명대사/나의）
const tabs = [
  { path: '/home', label: '오늘 · 今日', icon: '☀️' },
  { path: '/chat', label: '대화 · 对话', icon: '💬' },
  { path: '/pronunciation', label: '발음 · 发音', icon: '🎤' },
  { path: '/quotes', label: '명대사 · 名句', icon: '🎬' },
  { path: '/profile', label: '나의 · 我的', icon: '🧑' }
];
</script>

<template>
  <nav class="tabbar">
    <router-link
      v-for="t in tabs"
      :key="t.path"
      :to="t.path"
      class="tab-item"
      :class="{ 'tab-on': $route.path === t.path }"
    >
      <span class="tab-ico">{{ t.icon }}</span>
      <span class="tab-label">{{ t.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: saturate(180%) blur(10px);
  -webkit-backdrop-filter: saturate(180%) blur(10px);
  border-top: 1px solid rgba(14, 24, 54, 0.06);
  display: flex;
  z-index: 50;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #86868B;
  transition: color 0.2s ease-out;
}
.tab-item:active { transform: scale(0.94); }
.tab-on { color: var(--c-klein); }
.tab-ico { font-size: 19px; line-height: 1.2; }
.tab-label { font-size: 10px; font-weight: 600; letter-spacing: 0.2px; }
</style>
