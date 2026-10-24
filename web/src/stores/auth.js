// 登录态全局状态（Pinia）：登录/注册/退出统一入口。
// 令牌本体仍持久化在 localStorage（utils/storage.js，请求层直接读取），
// store 是它的响应式视图：路由守卫、登录页、档案页都从这里读写，
// 避免「storage 改了但界面不知道」的双源问题。
import { defineStore } from 'pinia';
import { getSession, setSession, clearSession } from '../utils/storage';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    userId: '',
    username: '',
    booted: false // 是否已从 localStorage 恢复过（路由守卫首次调用时恢复）
  }),
  getters: {
    isLogged: (s) => !!s.token
  },
  actions: {
    // 应用启动/守卫首次进入时，从 localStorage 恢复会话
    bootstrap() {
      if (this.booted) return;
      const s = getSession();
      this.token = s.token || '';
      this.userId = s.userId || '';
      this.username = s.username || '';
      this.booted = true;
    },
    // 登录/注册成功后写入（data: {token, userId, username}）
    signIn(data) {
      setSession({
        token: data.token,
        userId: data.userId,
        username: data.username
      });
      this.token = data.token;
      this.userId = data.userId;
      this.username = data.username || '';
      this.booted = true;
    },
    logout() {
      clearSession();
      this.token = '';
      this.userId = '';
      this.username = '';
    }
  }
});
