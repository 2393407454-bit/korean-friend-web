# 部署指南 · 让评委看到你的成果

> 面向「한국어 친구」韩语学习小程序（微信小程序 + Node/Express 后端）

---

## 一、先搞清楚：评委怎么验收？

**这一步决定了你要不要买服务器。** 去翻比赛通知，看它属于哪种：

| 验收方式 | 要不要服务器 | 说明 |
|---|---|---|
| 只交演示视频 + 项目文档 | **不需要** | 本机跑后端录屏即可 |
| 现场演示（你自己操作） | **不需要** | 用开发者工具或你的手机演示 |
| 评委自己扫码体验 | **必须部署** | 要有公网 HTTPS 后端 |
| 提交代码仓库 | **不需要** | 已同步到 GitHub |

**无论哪种情况，都建议先录一个完整演示视频**——它不受网络、服务稳定性、现场环境影响，是性价比最高的成果载体。

---

## 二、三种方案对比

| 方案 | 备案 | 费用 | 上线耗时 | 代码改动 | 适用 |
|---|---|---|---|---|---|
| **本地演示** | 不需要 | 0 元 | 立即 | 无 | 视频 + 现场演示 |
| **云服务器 + 域名** | 必须 | 约 10–20 元/月 + 域名约 30 元/年 | **备案 1–3 周** | 只改 1 行 | 评委扫码体验（推荐） |
| **微信云托管** | 免备案 | 按量计费 | 1 天内 | 较大（见下） | 时间极紧时的应急 |

**重要提醒**：Cloudflare（Workers / Pages / Tunnel）**无法用于微信小程序**。原因是微信要求服务器域名必须完成 ICP 备案，而 Cloudflare 的免费域名（`workers.dev`、`pages.dev`、`trycloudflare.com`）不具备备案资格；即便用自有域名经 Cloudflare 中转，接入商与备案不一致，也存在备案被注销的风险。Cloudflare 唯一合法用法是仅做 DNS 解析（关闭橙云代理）。

---

## 三、方案一：本地演示（零成本，今天就能用）

### 启动后端

```bash
cd server
cp .env.example .env        # 首次需填 LLM_API_KEY 等
node src/index.js
```

### 小程序端

`miniprogram/utils/config.js` 保持 `const ENV = 'dev'`，并把 `DEV_HOST` 改成你电脑当前的局域网 IP：

```bash
ipconfig getifaddr en0      # macOS 查看局域网 IP
```

然后在微信开发者工具中：**详情 → 本地设置 → 勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」**。

### 录演示视频的建议

- 用开发者工具自带录屏，或系统录屏，**分辨率至少 1080p**
- 脚本顺序建议：能力测评 → AI 建立画像 → 薄弱点发现 → 情景对练 → 实时纠错 → K-pop 学歌 → 学习报告
- 每个功能停留 5–10 秒，让评委看清界面
- 录完检查一遍：**AI 回复是否完整、韩语发音是否播放、有没有报错弹窗**

---

## 四、方案二：云服务器 + 域名 + 备案（推荐）

**代码改动最小**——现有 Express 架构原样跑，只改一行配置。适合需要"评委扫码体验"的场景。

### 时间线（务必倒推）

```
第 1 天   买服务器 + 买域名 + 提交备案
第 1–15 天 等备案通过（各省不同，通常 7–20 个工作日）
第 16 天  部署服务 + 配 HTTPS + 配置小程序合法域名
第 17 天  提交体验版审核，拿到二维码
```

**如果比赛截止日期在 3 周内，今天就该启动备案。**

### 买什么

- **服务器**：腾讯云 / 阿里云「轻量应用服务器」，2 核 2G 足够，学生认证有优惠（约 10 元/月）
- **域名**：`.com` / `.cn` 均可，约 30–60 元/年，需**实名认证**
- **备案**：在服务器提供商的备案系统提交，个人主体可备案（个人性质备案）

> 服务器地域必须选**中国大陆**，否则无法备案。

### 部署步骤

**1. 服务器上装 Node 20 与 Caddy**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

**2. 上传代码并安装依赖**

```bash
# 在本地执行，把 server 目录传上去（或用 git clone）
rsync -avz --exclude node_modules --exclude data server/ user@你的服务器IP:/opt/korean-server/
```

```bash
# 在服务器执行
cd /opt/korean-server
npm install --omit=dev
cp .env.example .env
vim .env                    # 填入 LLM_API_KEY / ASR_API_KEY / TTS_API_KEY 等
```

**3. 用 systemd 常驻运行**

创建 `/etc/systemd/system/korean-server.service`：

```ini
[Unit]
Description=Korean Friend API Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/korean-server
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now korean-server
sudo systemctl status korean-server      # 确认 active (running)
```

**4. Caddy 自动配 HTTPS**（证书自动申请、自动续期，无需手动操作）

编辑 `/etc/caddy/Caddyfile`：

```
korean.你的域名.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

> Caddy 会自动向 Let's Encrypt 申请证书。**前提是域名已备案且解析到本机 IP**。

**5. 小程序后台配置合法域名**

登录 [微信公众平台](https://mp.weixin.qq.com) → **开发管理 → 开发设置 → 服务器域名**，添加：

| 类型 | 值 |
|---|---|
| request 合法域名 | `https://korean.你的域名.com` |
| uploadFile 合法域名 | `https://korean.你的域名.com` |
| downloadFile 合法域名 | `https://korean.你的域名.com` |

**6. 改小程序配置并发布**

```js
// miniprogram/utils/config.js
const ENV = 'prod';
const PROD_HOST = 'https://korean.你的域名.com';
```

然后在开发者工具点**上传** → 在公众平台提交审核 → 通过后发布，或先生成**体验版**二维码给评委。

### 部署后自检清单

```bash
curl https://korean.你的域名.com/api/health     # 后端存活
```

- [ ] `https://` 能正常访问，证书无警告
- [ ] 小程序真机（非开发者工具）能正常对话
- [ ] 韩语发音（TTS）能播放
- [ ] 录音上传能识别（ASR）
- [ ] 拍照识歌词能返回结果（VLM）
- [ ] `server/data/` 目录有写权限（否则用户档案存不下）
- [ ] `.env` 未提交到 Git

---

## 五、方案三：微信云托管（免备案，但有硬限制）

云托管确实免备案，但**对 AI 对话类应用限制明显**，请先看清再决定：

| 限制 | 具体数值 | 对本项目的影响 |
|---|---|---|
| 请求超时上限 | **最长 15 秒**（超出该值的 timeout 设置无效） | AI 生成常需 20–60 秒，**可能中途断开** |
| 请求体大小 | 100 KiB（对象类型 20 MiB） | 录音 / 拍照上传需改用对象存储 |
| 返回包大小 | 1000 KiB | 长歌词分析结果可能超限 |
| 流式接收 | `callContainer` 返回 Promise，无 `onChunkReceived` | **打字机效果失效**，需降级为一次性返回 |
| 容器存储 | 非持久，重启即丢 | `server/data/*.json` 会丢失，需改用 MySQL |
| 基础库要求 | ≥ 2.23.0 | 需在后台设置最低基础库版本 |
| 主体要求 | 通常需小程序已完成微信认证 | **个人主体可能无法开通** |

### 如果仍要走这条路

**1. 确认开通资格**：登录 [微信云托管控制台](https://cloud.weixin.qq.com/cloudrun) 看能否创建环境。

**2. 构建并推送镜像**（Dockerfile 已备好）：

```bash
cd server
docker build -t korean-server .
```

也可在云托管控制台选择「GitHub 仓库自动部署」——本项目已同步到 GitHub，可直接关联。

**3. 小程序端改造**：把 `wx.request` 换成 `wx.cloud.callContainer`。

```js
// app.js 中先初始化（全局一次）
App({
  onLaunch() {
    if (!wx.cloud) return;
    wx.cloud.init();
  }
});

// utils/api.js 中的请求改为：
const res = await wx.cloud.callContainer({
  config: { env: '你的环境ID' },
  path: url,                                  // 注意：不需要域名前缀
  method: 'POST',
  data,
  header: { 'X-WX-SERVICE': '你的服务名' }
});
```

**4. 服务设置中「关闭公网访问」**，只允许小程序经微信专线访问，可免费获得 DDoS 防护。

> 注意：改造后 `/api/chat/stream` 流式接口需降级为 `/api/chat` 一次性返回（代码中已有 fallback 逻辑，会自动切换）。

---

## 六、常见问题

**Q：为什么不能用 Cloudflare？**
微信小程序要求服务器域名完成 ICP 备案，Cloudflare 免费域名无法备案；用自有域名经 Cloudflare 中转会改变接入商，与备案信息不一致，存在被注销风险。详见本文第二节。

**Q：备案要多久？可以加急吗？**
通常 7–20 个工作日，各省通信管理局审核速度不同，**无法加急**。所以时间紧张时应第一时间启动。

**Q：个人主体能备案吗？**
可以，做「个人性质备案」即可。但个人主体小程序**无法做微信认证**，可能用不了微信云托管。

**Q：本地演示时手机连不上后端？**
1. 确认手机和电脑连的是**同一个 WiFi**
2. 确认 `DEV_HOST` 填的是电脑的局域网 IP（不是 `127.0.0.1`）
3. 确认电脑防火墙放行了 3000 端口
4. 开发者工具需勾选「不校验合法域名」

**Q：服务器部署后小程序报「不在以下 request 合法域名列表中」？**
说明还没在小程序后台配置服务器域名，或配置后未等生效（约 5 分钟）。注意域名必须是 `https` 且已备案。

**Q：`server/data/` 里的用户档案会不会丢？**
本地和服务器部署都不会丢。**只有云托管容器会丢**（重启即重置），需改用 MySQL。

---

## 七、我的建议（按优先级）

1. **今天**：确认比赛验收方式，**先录一版演示视频**（保底成果）
2. **如果只需视频/现场演示**：到此为止，零成本搞定
3. **如果需要评委扫码**：
   - 时间充裕（> 3 周）→ 走方案二，**今天就提交备案**
   - 时间极紧 → 试方案三云托管，同时准备"用自己手机现场演示"的备选
4. **代码已同步 GitHub**，这本身也是可提交的成果之一
