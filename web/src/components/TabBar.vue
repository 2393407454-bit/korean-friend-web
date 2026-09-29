<script setup>
// 底部导航：线性图标 + 统一字阶，激活态用品牌蓝
const tabs = [
  { path: '/home', label: '今日', icon: 'home' },
  { path: '/chat', label: '对话', icon: 'chat' },
  { path: '/pronunciation', label: '发音', icon: 'mic' },
  { path: '/quotes', label: '名句', icon: 'quote' },
  { path: '/profile', label: '我的', icon: 'user' }
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
      <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <template v-if="t.icon === 'home'">
          <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />
        </template>
        <template v-else-if="t.icon === 'chat'">
          <path d="M20 12a8 8 0 1 0-3.1 6.3L20 19l-.7-3A7.9 7.9 0 0 0 20 12Z" />
          <path d="M8.5 11h7M8.5 14h4.5" />
        </template>
        <template v-else-if="t.icon === 'mic'">
          <rect x="9" y="3.5" width="6" height="11" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
        </template>
        <template v-else-if="t.icon === 'quote'">
          <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5v-14Z" />
          <path d="M8.5 9.5h7M8.5 12.5h4.5" />
        </template>
        <template v-else>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" />
        </template>
      </svg>
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
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: saturate(180%) blur(16px);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  border-top: 1px solid var(--line);
  display: flex;
  z-index: 50;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--ink-3);
  transition: color .18s ease;
}
.tab-item:active { transform: scale(0.94); }
.tab-on { color: var(--accent); }
.tab-ico { width: 22px; height: 22px; }
.tab-label { font-size: 10px; font-weight: 600; letter-spacing: 0.02em; }
</style>
