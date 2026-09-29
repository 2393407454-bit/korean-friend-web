import { createRouter, createWebHistory } from 'vue-router';
import { isLogged } from '../utils/storage';

// tab 页：home/chat/pronunciation/quotes/profile（对应小程序 tabBar）
// song 为二级页（对应 wx.navigateTo）；login 公开，其余一律登录后可见
const routes = [
  { path: '/login', name: 'login', component: () => import('../pages/Login.vue'), meta: { public: true } },
  { path: '/home', name: 'home', component: () => import('../pages/Home.vue'), meta: { tab: true } },
  { path: '/chat', name: 'chat', component: () => import('../pages/Chat.vue'), meta: { tab: true } },
  { path: '/pronunciation', name: 'pronunciation', component: () => import('../pages/Pronunciation.vue'), meta: { tab: true } },
  { path: '/quotes', name: 'quotes', component: () => import('../pages/Quotes.vue'), meta: { tab: true } },
  { path: '/profile', name: 'profile', component: () => import('../pages/Profile.vue'), meta: { tab: true } },
  { path: '/song', name: 'song', component: () => import('../pages/Song.vue') },
  { path: '/', redirect: '/home' },
  { path: '/:pathMatch(.*)*', redirect: '/home' }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  if (!to.meta.public && !isLogged()) return '/login';
  if (to.path === '/login' && isLogged()) return '/home';
  return true;
});

export default router;
