#!/bin/bash
# 开机自愈：隧道 → 新地址 → 前端重建部署 → 地址落盘（/Users/Shared + 桌面尽力）+ 推送 GitHub
# 由 LaunchAgent (com.koreanfriend.tunnel) 拉起，KeepAlive=true：脚本退出即重启
# 安装位置：/usr/local/bin/koreanfriend-tunnel.sh（Desktop 受 TCC 保护，launchd 无法执行）
export PATH="/Users/apple/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/bin:/usr/bin:/bin"
WEB_DIR="$HOME/Desktop/korean-friend-app_副本/web"
SERVER_DIR="$HOME/Desktop/korean-friend-app_副本/server"
LOG=/tmp/kfp-tunnel.log
LAST=/tmp/kfp-tunnel-url
URL_FILE_SHARED="/Users/Shared/手机访问地址.txt"

# Keep the tunnel target aligned with the backend's configured port.
BACKEND_PORT="${PORT:-3000}"
if [ -f "$SERVER_DIR/.env" ]; then
  ENV_PORT=$(awk -F= '$1 == "PORT" { gsub(/[ \t\r]/, "", $2); if ($2 != "") print $2 }' "$SERVER_DIR/.env" | tail -1)
  [ -n "$ENV_PORT" ] && BACKEND_PORT="$ENV_PORT"
fi
if ! curl -fsS --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
  echo "[$(date)] 后端未在端口 ${BACKEND_PORT} 就绪，跳过隧道启动" >> /tmp/kfp-tunnel-err.log
  exit 1
fi
# Health alone is insufficient: the public entrypoint must also serve the SPA shell.
if ! curl -fsS --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/" | grep -q 'id="app"'; then
  echo "[$(date)] 后端端口 ${BACKEND_PORT} 未提供 web/dist，跳过隧道启动" >> /tmp/kfp-tunnel-err.log
  exit 1
fi

pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
: > "$LOG"
/opt/homebrew/bin/cloudflared tunnel --url "http://127.0.0.1:${BACKEND_PORT}" >> "$LOG" 2>&1 &
CFPID=$!

# 最多等 90 秒提取新地址
URL=""
for i in $(seq 1 45); do
  URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 2
done
[ -n "$URL" ] || { echo "[$(date)] 未取到隧道地址" >> /tmp/kfp-tunnel-err.log; exit 1; }

# 地址变化才重新构建部署（避免每次开机都白跑一遍）
if [ "$URL" != "$(cat "$LAST" 2>/dev/null)" ]; then
  printf '%s' "$URL" > "$LAST"
  printf 'VITE_API_BASE=%s\n' "$URL" > "$WEB_DIR/.env.production"
  cd "$WEB_DIR" && npm run build >/dev/null 2>&1 && npx --yes wrangler deploy >/dev/null 2>&1
  # 新地址留痕到 GitHub（网络不通时忽略，下次开机再推）
  cd "$HOME/Desktop/korean-friend-app_副本"
  git add web/.env.production >/dev/null 2>&1
  git commit -m "chore(web): 隧道地址更新为 $URL" >/dev/null 2>&1
  git push origin main >/dev/null 2>&1
fi

{
  echo "更新时间: $(date '+%m-%d %H:%M')"
  echo ""
  echo "手机/电脑打开：$URL"
  echo "测试账号：smoketest1 / test123456"
  echo ""
  echo "· Mac 关机后网站下线（数据不会丢），开机后约 1 分钟自动恢复"
  echo "· 本地址在 Mac 重启后可能变化，以本文件为准"
} > "$URL_FILE_SHARED"
cp "$URL_FILE_SHARED" "$HOME/Desktop/手机访问地址.txt" 2>/dev/null

echo "[$(date)] 隧道就绪: $URL" >> /tmp/kfp-tunnel-err.log

# 前台等待；cloudflared 挂掉 → wait 返回 → KeepAlive 重启本脚本重新走流程
wait $CFPID
