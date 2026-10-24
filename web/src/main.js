import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles/global.css';

createApp(App).use(createPinia()).use(router).mount('#app');

// 空闲预热其余页面 chunk：把「首次点击某 tab 时的编译/下载」提前到后台完成，
// 使冷路径切换也接近热路径速度（与路由懒加载共用同一模块，不会重复加载）
function prefetchPages() {
  import('./pages/Home.vue');
  import('./pages/Chat.vue');
  import('./pages/Pronunciation.vue');
  import('./pages/Quotes.vue');
  import('./pages/Profile.vue');
  import('./pages/Song.vue');
}
if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  requestIdleCallback(prefetchPages, { timeout: 3000 });
} else {
  setTimeout(prefetchPages, 1200);
}
