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
    outDir: 'dist',
    rollupOptions: {
      output: {
        // 第三方依赖单独成 vendor chunk：业务代码迭代时用户无需重新下载框架代码（长缓存）
        manualChunks(id) {
          // three.js 只在「课程」页按需加载，单独成 chunk，不把它塞进首屏 vendor
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules')) return 'vendor';
        }
      }
    }
  }
});
