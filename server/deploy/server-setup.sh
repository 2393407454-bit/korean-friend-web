#!/usr/bin/env bash
# =============================================================
# 한국어 친구 后端一键部署（全新 Ubuntu 22.04/24.04 服务器）
# 用法：把本脚本传到服务器后执行
#   sudo bash server-setup.sh
# 可选环境变量：
#   REPO_URL  带令牌的仓库地址（私有仓库用
#             https://<token>@github.com/2393407454-bit/korean-friend-web.git）
#             不填则假定代码已拷贝到 APP_DIR
#   APP_DIR   代码目录，默认 /opt/korean-server
#   PORT      服务端口，默认 3010
# =============================================================
set -euo pipefail

REPO_URL="${REPO_URL:-}"
APP_DIR="${APP_DIR:-/opt/korean-server}"
PORT="${PORT:-3010}"
NODE_MAJOR="20"

[ "$(id -u)" = "0" ] || { echo "请用 sudo 运行"; exit 1; }

echo "==> 1/5 安装 Node ${NODE_MAJOR}（apt 密钥环方式，不执行下载脚本）+ ffmpeg + git"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ffmpeg git
install -d -m 0755 /etc/apt/keyrings
curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update -y
apt-get install -y nodejs

echo "==> 2/5 拉取代码"
if [ -n "$REPO_URL" ] && [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
[ -d "$APP_DIR/server" ] || { echo "未找到 $APP_DIR/server，请先拷贝代码或设置 REPO_URL"; exit 1; }

echo "==> 3/5 安装依赖"
cd "$APP_DIR/server"
npm ci --omit=dev || npm install --omit=dev

echo "==> 4/5 生成 .env（已有则跳过；LLM_API_KEY 需自行填入）"
if [ ! -f .env ]; then
  cp .env.example .env
  {
    echo ""
    echo "PORT=$PORT"
    echo "AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    echo "AUTH_REQUIRED=true"
    echo "# CORS_ORIGIN=https://korean-friend-web.你的子域.workers.dev"
  } >> .env
  echo "!!! 已生成 $APP_DIR/server/.env —— 请填入 LLM_API_KEY（智谱 Key）后重启服务"
fi
mkdir -p data

echo "==> 5/5 配置 systemd 常驻"
cat > /etc/systemd/system/korean-server.service <<UNIT
[Unit]
Description=korean-friend server
After=network.target

[Service]
WorkingDirectory=$APP_DIR/server
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now korean-server
sleep 1
systemctl --no-pager status korean-server | head -5 || true

IP=$(curl -s -m 5 https://api.ipify.org || echo "<服务器IP>")
echo ""
echo "✅ 部署完成：http://$IP:$PORT/api/health 应返回能力 JSON"
echo "   下一步：参照 DEPLOY.md 配置 cloudflared 命名隧道获得固定 HTTPS 域名"
