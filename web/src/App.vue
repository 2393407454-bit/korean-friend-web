<script setup>
import TabBar from './components/TabBar.vue';
import { toastState } from './utils/ui';
</script>

<template>
  <div class="shell">
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <TabBar v-if="$route.meta.tab" />
    <div v-if="toastState.visible" class="toast">{{ toastState.msg }}</div>
  </div>
</template>

<style>
/* 页面切换：轻淡入 + 微上移，保持克制 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
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
