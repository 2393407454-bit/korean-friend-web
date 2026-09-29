import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// dev 时 /api 与 /avatars 代理到本地 Express 后端（server/），生产构建后由后端同源托管 web/dist
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 默认连本机 3000 后端；可用 BACKEND_URL=http://localhost:3010 npm run dev 覆盖
      '/api': process.env.BACKEND_URL || 'http://localhost:3000',
      '/avatars': process.env.BACKEND_URL || 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist'
  }
});
