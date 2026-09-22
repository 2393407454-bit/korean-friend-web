# 韩语学习小程序后端 · 通用镜像
# 适用于：微信云托管 / 任意支持 Docker 的云服务器
FROM node:20-alpine

WORKDIR /app

# 先复制依赖清单再安装，利用 Docker 层缓存加速重复构建
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# 复制源码
COPY src ./src

# 运行时数据目录（用户档案 JSON 落在这里）
# 注意：容器文件系统非持久，重启/重新部署会丢失。
# 正式环境建议改用云托管 MySQL 或对象存储。
RUN mkdir -p /app/data

ENV NODE_ENV=production
# 微信云托管要求服务监听 80 端口；自建服务器可用 PORT 环境变量覆盖
ENV PORT=80

EXPOSE 80

CMD ["node", "src/index.js"]
