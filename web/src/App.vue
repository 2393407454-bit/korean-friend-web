<script setup>
import TabBar from './components/TabBar.vue';
import { toastState } from './utils/ui';
</script>

<template>
  <div class="shell">
    <router-view />
    <TabBar v-if="$route.meta.tab" />
    <div v-if="toastState.visible" class="toast">{{ toastState.msg }}</div>
  </div>
</template>
