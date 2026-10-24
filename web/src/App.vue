<script setup>
import TabBar from './components/TabBar.vue';
import { toastState } from './utils/ui';
</script>

<template>
  <div class="shell">
    <router-view v-slot="{ Component }">
      <!-- 交叉淡切：新旧页面同时在场交替，取消 out-in 串行等待 -->
      <transition name="page">
        <!-- Home 无 unmount 清理逻辑，缓存后回访不再重新挂载与重复请求 -->
        <keep-alive include="Chat,Home" :key="$route.meta.public ? 'public' : 'authenticated'">
          <component :is="Component" />
        </keep-alive>
      </transition>
    </router-view>
    <TabBar v-if="$route.meta.tab" />
    <div v-if="toastState.visible" class="toast">{{ toastState.msg }}</div>
  </div>
</template>

<style>
/* 页面切换：交叉淡入 + 微上移，新页面即时在位，旧页面同步退场 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.16s ease, transform 0.16s cubic-bezier(0.22, 0.61, 0.36, 1);
}
/* 交叉淡切：旧页面脱离文档流叠放并让位，避免与入场页面同时占位造成跳动 */
.page-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 0;
  pointer-events: none;
}
.page-enter-active { position: relative; z-index: 1; }
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
}
</style>
