#!/bin/bash
# 开机自愈 + 健康看门狗：后端就绪检查 → 隧道 → 地址落盘 → 每 5 分钟体检，失效自动换新地址
# TryCloudflare 临时隧道约 24 小时过期（Unauthorized: Tunnel not found），
# 看门狗检测到失效后杀掉 cloudflared，KeepAlive 重启本脚本即获得新地址
# 前端为同源相对路径调 API，地址轮换无需重新构建前端（workers.dev 入口已弃用）
# 运行副本：~/Library/korean-friend/tunnel-auto.sh（Desktop 受 TCC 保护，launchd 无法执行其上的脚本）
export PATH="/Users/apple/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/bin:/usr/bin:/bin"
LOG=/tmp/kfp-tunnel.log
URL_FILE_SHARED="/Users/Shared/手机访问地址.txt"
SERVER_DIR="$HOME/Desktop/korean-friend-app_副本/server"

# 后端端口：默认 3010（本副本），server/.env 的 PORT 可覆盖
BACKEND_PORT="${PORT:-3010}"
if [ -f "$SERVER_DIR/.env" ]; then
  ENV_PORT=$(awk -F= '$1 == "PORT" { gsub(/[ \t\r]/, "", $2); if ($2 != "") print $2 }' "$SERVER_DIR/.env" | tail -1)
  [ -n "$ENV_PORT" ] && BACKEND_PORT="$ENV_PORT"
fi

# 就绪检查：API 健康 + 能返回 SPA 外壳（确认 Express 托管了前端 dist）
if ! curl -fsS --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
  echo "[$(date)] 后端未在端口 ${BACKEND_PORT} 就绪，跳过隧道启动" >> /tmp/kfp-tunnel-err.log
  exit 1
fi
if ! curl -fsS --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/" 2>/dev/null | grep -q 'id="app"'; then
  echo "[$(date)] 后端端口 ${BACKEND_PORT} 未提供前端页面，跳过隧道启动" >> /tmp/kfp-tunnel-err.log
  exit 1
fi

start_tunnel() {
  pkill -f "cloudflared tunnel" 2>/dev/null
  sleep 1
  : > "$LOG"
  /opt/homebrew/bin/cloudflared tunnel --url "http://127.0.0.1:${BACKEND_PORT}" >> "$LOG" 2>&1 &
  CFPID=$!
}

extract_url() {
  local URL=""
  for i in $(seq 1 45); do
    URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "$LOG" | head -1)
    [ -n "$URL" ] && { echo "$URL"; return 0; }
    sleep 2
  done
  return 1
}

write_url_file() {
  {
    echo "更新时间: $(date '+%m-%d %H:%M')"
    echo ""
    echo "手机/电脑打开：$1"
    echo "测试账号：smoketest1 / test123456"
    echo ""
    echo "· Mac 关机后网站下线（数据不会丢），开机后约 1 分钟自动恢复"
    echo "· 免费临时隧道地址会自动轮换，打不开时以本文件为准（长效方案见 DEPLOY.md：服务器+固定域名）"
  } > "$URL_FILE_SHARED"
  cp "$URL_FILE_SHARED" "$HOME/Desktop/手机访问地址.txt" 2>/dev/null
}

start_tunnel
URL=$(extract_url) || { echo "[$(date)] 未取到隧道地址" >> /tmp/kfp-tunnel-err.log; exit 1; }
write_url_file "$URL"
echo "[$(date)] 隧道就绪: $URL" >> /tmp/kfp-tunnel-err.log

# ===== 健康看门狗：每 5 分钟体检，连续 2 次失效 → 换新隧道 =====
FAIL=0
while kill -0 "$CFPID" 2>/dev/null; do
  sleep 300
  CODE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "$URL/api/health" 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    FAIL=0
  else
    FAIL=$((FAIL + 1))
    echo "[$(date)] 体检失败($FAIL): $URL → HTTP $CODE" >> /tmp/kfp-tunnel-err.log
    [ "$FAIL" -ge 2 ] && break
  fi
done

# 走到这里 = cloudflared 退出或隧道失效；脚本退出后 KeepAlive 会重启本脚本换取新地址
exit 0
