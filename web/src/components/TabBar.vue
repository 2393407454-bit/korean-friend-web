<script setup>
// 悬浮胶囊导航（韩风杂志版）：纸感玻璃 + 发丝线 + 墨色滑动印泥
// 布局：等宽网格单元，图标与文字共享中心线，高亮与导航格严格对齐
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const tabs = [
  { path: '/home',          label: '今日', icon: 'home' },
  { path: '/course',        label: '课程', icon: 'book' },
  { path: '/chat',          label: '对话', icon: 'chat' },
  { path: '/pronunciation', label: '发音', icon: 'mic' },
  { path: '/quotes',        label: '名句', icon: 'quote' },
  { path: '/profile',       label: '我的', icon: 'user' }
];

const activeIndex = computed(() => {
  const idx = tabs.findIndex((t) => route.path === t.path);
  return idx < 0 ? 0 : idx;
});
</script>

<template>
  <nav class="tabbar" role="tablist" aria-label="主导航">
    <div class="tabbar-inner" :style="{ '--tab-count': tabs.length }">
      <!-- 滑动高亮：墨色印泥 -->
      <div
        class="tabbar-glider"
        :style="{ transform: `translateX(${activeIndex * 100}%)` }"
        aria-hidden="true"
      ></div>

      <!-- 导航项 -->
      <router-link
        v-for="t in tabs"
        :key="t.path"
        :to="t.path"
        class="tab-item"
        :class="{ 'tab-on': $route.path === t.path }"
        role="tab"
        :aria-selected="$route.path === t.path"
      >
        <svg
          class="tab-ico"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <!-- 今日：房屋 -->
          <template v-if="t.icon === 'home'">
            <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />
          </template>
          <!-- 课程：书本 -->
          <template v-else-if="t.icon === 'book'">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4V5.5Z" />
            <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6V5.5Z" />
          </template>
          <!-- 对话：气泡 -->
          <template v-else-if="t.icon === 'chat'">
            <path d="M20 12a8 8 0 1 0-3.1 6.3L20 19l-.7-3A7.9 7.9 0 0 0 20 12Z" />
            <path d="M8.5 11h7M8.5 14h4.5" />
          </template>
          <!-- 发音：麦克风 -->
          <template v-else-if="t.icon === 'mic'">
            <rect x="9" y="3.5" width="6" height="11" rx="3" />
            <path d="M4 11.5a8 8 0 0 0 16 0M12 19v2" />
          </template>
          <!-- 名句：引号 -->
          <template v-else-if="t.icon === 'quote'">
            <path d="M4 6h5v6H4zM15 6h5v6h-5zM4 12h2l-2 5M15 12h2l-2 5" />
          </template>
          <!-- 我的：人像 -->
          <template v-else>
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" />
          </template>
        </svg>
        <span class="tab-label">{{ t.label }}</span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  bottom: calc(12px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  padding: 6px;
  border-radius: var(--radius-pill);
  background: rgba(252, 251, 247, 0.88);
  border: 1px solid var(--line-2);
  box-shadow:
    0 6px 24px rgba(32, 39, 37, 0.10),
    0 20px 48px rgba(32, 39, 37, 0.12);
  backdrop-filter: saturate(160%) blur(20px);
  -webkit-backdrop-filter: saturate(160%) blur(20px);
}

.tabbar-inner {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--tab-count), 48px);
}

/* 滑动高亮：墨色圆印，激活项反白 */
.tabbar-glider {
  position: absolute;
  top: 0;
  left: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--ink);
  transition: transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
  z-index: 0;
}

/* 每个导航项：固定图标行与文字行，共用同一条水平中心线 */
.tab-item {
  position: relative;
  z-index: 1;
  width: 48px;
  height: 48px;
  display: grid;
  grid-template-rows: 20px 10px;
  align-content: center;
  justify-items: center;
  row-gap: 2px;
  color: var(--ink-3);
  border-radius: 50%;
  transition: color 0.25s ease, transform 0.15s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.tab-item:active {
  transform: scale(0.92);
}

.tab-on {
  color: #FCFBF7;
}

/* 图标：固定尺寸，永远居中 */
.tab-ico {
  width: 20px;
  height: 20px;
  display: block;
  flex-shrink: 0;
  stroke-width: 1.8;
}

/* 标签：固定尺寸，永远居中，始终可见 */
.tab-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  transition: opacity 0.25s ease, color 0.25s ease;
  opacity: 0.75;
}

.tab-on .tab-label {
  opacity: 1;
}

/* 键盘聚焦 */
.tab-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .tabbar-glider,
  .tab-item,
  .tab-label {
    transition: none;
  }
}
</style>
