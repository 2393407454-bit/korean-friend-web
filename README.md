# 한국어 친구 · 韩语学习智能体（网页版 + 微信小程序版）

一个可以**语音交流、上传教材图片**的韩语学习智能体，对标多邻国/流利说的系统化教学 + 真人语伴式对话。完整教学法见 `server/src/system-prompt.js`，项目导览见 `docs/项目导览-大白话版.md`。

```
korean-friend-app/
├── web/                  # 网页版前端（Vue 3 + Vite + Pinia，含登录页；构建后由 server 同源托管）
│   ├── src/pages/        #   login / home / course / practice / progress / chat / pronunciation / song / quotes / profile
│   ├── src/components/   #   3D 韩屋学习庭院、立体编辑海报、翻转单词卡、等级通行证等交互组件
│   ├── src/stores/       #   Pinia 登录态（token/用户信息，storage 的响应式视图）
│   └── src/api/          #   fetch 封装、SSE 流式（含 Agent 工具事件帧）、TTS 播放
├── miniprogram/          # 微信小程序前端（原生框架，微信开发者工具直接导入）
│   ├── pages/chat/       #   对话页：文本/语音输入、TTS 播报、模式切换、文件上传
│   ├── pages/pronunciation/  # 发音页：跟读练习 → ASR → AI 发音反馈 + 发音评分趋势
│   ├── pages/profile/    #   档案页：定级/生词本/错误记录/进度报告
│   └── utils/            #   接口封装、TTS 播放、配置
└── server/               # Node 后端（Express）
    └── src/
        ├── agent.js          # 智能体编排：通道感知 → 状态注入 → 结构化输出 → 状态回写
        ├── tools.js          # Function Calling 工具集：知识库检索/歌词曲库/生词本（模型自主调用）
        ├── knowledge.js      # RAG 检索：向量优先（embedding-3 本地索引）+ 关键词降级
        ├── data/knowledge.js # 韩语教学知识库语料（语法/发音/辨析/文化/备考/生活，80+ 条）
        ├── system-prompt.js  # 教学法系统提示词（动态注入用户状态/复习队列/难度档位）
        ├── llm.js            # OpenAI 兼容多模态客户端（LLM/VLM/ASR/TTS/embedding）+ 工具循环 + 演示模式
        ├── store.js          # 用户档案/生词本/SRS 复习/错误日志（JSON 存储）
        ├── auth.js           # 网页版账号体系：注册/登录/令牌校验（HMAC，零依赖）
        └── security.js       # 微信 msgSecCheck 内容安全 + code2Session（上线用）
```

> Agent 架构（Function Calling + RAG）：聊天命中学习意图时，模型可自主调用 `search_knowledge`（RAG 检索教学知识库）、`search_songs`（已核实歌词曲库）、`lookup_vocab`（学生生词本与复习队列）三个工具，查完资料再生成回复；网页端会在气泡上实时显示「查资料中：教学知识库」与「已查阅」轨迹，可解释、可答辩。工具循环最多 3 轮，模型/网关不支持时自动摘除工具降级，关键词检索在无向量索引（未配 embedding 余额）时兜底，任何一层失败都不影响对话可用。

> 注：README 早期描述过「摄像头抽帧口型纠音」，当前版本**尚未实现**该链路（前端无 camera/抽帧流程），已从文档移除，作为未来可接入的方向记录在案。

## 网页版视觉、课程与 3D 交互

网页版采用「现代韩系杂志」视觉方向：暖白纸张、墨黑排版与原创首尔摄影。登录页在桌面端为城市封面与登录内页的双栏布局，手机端自动改为上下结构；登录或注册成功后，以“翻开下一期学习期刊”的转场衔接首页。系统开启“减少动态效果”时直接切页。

首页包含可拖动的立体学习海报，也支持方向键调整视角、Home 键复位。课程区提供韩语 A1、A2、B1 三个级别，共 18 个单元、54 节课；Three.js 场景已改为纸雕韩屋学习庭院，每个级别聚焦 6 个单元。拖动可环视，滚轮或触屏双指可缩放，点击立体课程卡查看课时与练习，学习级别按单元完成度解锁。

- 单词练习是实体厚度的双面翻卡，可点击或键盘翻面并自评熟悉度。
- 语法与听力是选择题，提交后即时显示解释、听力原文与中文释义。
- 口语练习提供韩语示范音、麦克风录音、实时波形、评分和回放；麦克风不可用时可继续体验演示评分。
- 学习进度页包含能力平均分、雷达图、12 周热力图、连续学习天数、XP 等级及单元进度。等级徽章以可拖动的 3D 学习通行证呈现。
- 课程练习在后端暂不可达时会把结算记录保存在当前浏览器，联网后自动补同步；离线状态会在结算页明确提示。

原创视觉素材位于 `web/public/images/`，以 WebP 本地打包，无外部图床依赖。Three.js 组件按需加载，3D 场景离屏或页面隐藏时暂停渲染；设备不支持 WebGL 时，课程列表、翻卡和等级信息仍有可读的降级视图。

## 一、10 分钟极速复现指南

**依赖一览**：Node.js ≥ 18（前后端同要求）+ npm；**无需任何数据库**（用户数据为 JSON 文件存储）；AI 服务全部可选——不配 Key 也能跑通主流程（演示模式）。

| 端 | 技术栈 |
|---|---|
| `web/` 网页版 | Vue 3 + Pinia + Vue Router + Vite |
| `server/` 后端 | Node.js（Express + openai SDK + msedge-tts + multer + dotenv） |
| `miniprogram/` 小程序 | 微信原生框架（可选进阶，见「二」） |

### 第 1 步 · 启动后端（约 2 分钟）

```bash
cd server
cp .env.example .env   # 环境变量模板，逐项注释齐全；什么都不填也能启动
npm install
npm start              # 监听 http://localhost:3000
```

- 未配置 `LLM_API_KEY` 时自动进入**演示模式**：注册登录、发消息、切模式等全部交互可跑，AI 回复为占位文案并明确提示「演示模式」
- 令牌签名密钥 `AUTH_SECRET` 不配置时后端首次启动自动生成并保存到 `data/auth_secret`，无需手动干预

### 第 2 步 · 启动网页版（约 2 分钟）

```bash
cd web
npm install
npm run dev        # http://localhost:5173，/api 与 /avatars 自动代理到本机 3000 后端
```

后端端口不是 3000 时：`BACKEND_URL=http://localhost:3010 npm run dev`

### 第 3 步 · 注册账号并验收（约 3 分钟）

首次进入自动跳转 `/login`，注册账号（用户名 3-20 位字母/数字/下划线 + 密码 ≥6 位），每个账号学习档案相互隔离。复现验收清单：

评委或首次访问者可先打开网页版 `/project` 查看无需登录的作品介绍、学习闭环、功能与技术架构；需要体验交互时，进入账号页注册后，从首页启动「演示模式」。

- [ ] 发消息收到 AI 回复（演示模式下为占位回复，页面有明确提示）
- [ ] 点击韩语句子能发音（网页版优先使用浏览器本地音色；否则由后端合成）
- [ ] 完成第 4 步配置并重启后：消息气泡出现「查资料中：教学知识库 / 已查阅」的 RAG 工具调用轨迹
- [ ] 上传教材图片能提取词汇（需视觉模型 Key）

### 第 4 步 · 接入 AI 能力（约 3 分钟，可选但推荐）

| 能力 | 推荐方案 | 说明 |
|---|---|---|
| LLM 大脑 | 智谱 GLM（open.bigmodel.cn）| `glm-4.7-flash` 免费且指令遵从度好（实测 glm-4-flash 教学合规性差，勿用）；关闭思考模式保证响应速度 |
| 图片 OCR/教材理解 | 同上 | `glm-4.6v-flash` 免费且韩文 OCR 相对准确（实测 glm-4v-flash 幻觉严重，勿用）。上传图片会先经 `server/src/media.js` 归一化：小图上采样到长边 1400+ 锐化、统一转 JPEG（低分辨率文字图直接进 VLM 会被误读），提取走「转写→对照原图校对」两轮 + 低温度，把免费模型的词级误读压到最低；教材类清晰照片表现最好 |
| 韩语语音识别 ASR | 同上 | `glm-asr-2512` 免费额度可用，与 LLM 同一个 Key，实测韩语识别准确 |
| 韩语语音合成 TTS | 网页版优先使用浏览器 Web Speech API 中的高质量韩语/中文音色（韩语偏好 Yuna，中文偏好 Tingting 等）；浏览器缺少任一所需音色或本地播放未启动时回退后端。后端按 Edge-TTS → 配置的 OpenAI 兼容云 TTS → macOS `say` 顺序尝试；Edge-TTS 按韩文/中文分段选音色并拼接，默认语速 `-10%` | 网页版本地播放无需网络合成请求；后端与小程序仍需服务端可用。macOS `say` 仅适用于 macOS 后端 |

> 智谱模型共用同一个 API Key（ASR/LLM/视觉已实测）。默认 TTS 优先使用免费 Edge-TTS，无需 Key；只有 Edge-TTS 不可用时才尝试已配置的云 TTS，macOS 后端还可继续使用系统 `say` 兜底。

> ⚠️ 未配置 ASR 时，聊天页语音输入不可用（会明确提示），文字交流不受影响。

### 环境变量速查

全部变量与逐项注释见 `server/.env.example`。影响复现判断的三个关键项：

| 变量 | 作用 | 不配置/默认时 |
|---|---|---|
| `LLM_API_KEY` | 对话/视觉/ASR 共用的智谱 Key | **演示模式**：占位回复，其余交互可用 |
| `CORS_ORIGIN` | 前端异源部署时放行跨域 | 本地 `npm run dev` 走 Vite 代理，可空 |
| `AUTH_REQUIRED` | 网页版 API 是否强制登录 | 默认 `true`；小程序联调时设 `false` 重启 |

## 二、微信小程序端（可选进阶）

1. 下载「微信开发者工具」，导入 `miniprogram/` 目录（测试号选 `touristappid`，或填自己的 AppID）
2. 「详情 → 本地设置」勾选 **不校验合法域名**（开发期）
3. 确认 `miniprogram/utils/config.js` 里 `BASE_URL` 指向你的后端地址（真机预览时改成电脑局域网 IP，如 `http://192.168.x.x:3000`）
4. 编译运行。语音权限首次使用时授权即可
5. ⚠️ 后端默认开启 API 登录校验（`AUTH_REQUIRED=true`），小程序没有网页令牌会被 401；联调小程序时请在 `server/.env` 设 `AUTH_REQUIRED=false` 重启

## 三、生产部署（前端上 Cloudflare、后端留在 Node 机器）

1. `cd web && VITE_API_BASE=https://你的后端域名 npm run build`，把 `web/dist` 作为静态资产部署到 Cloudflare Workers/Pages（现有 Workers 部署即是）
2. 后端必须跑在**支持 Node 的机器**上（本机/云服务器/Railway 等）——`server/` 用了文件存储与 ffmpeg/edge-tts 子进程，**不能跑在 Cloudflare Workers 运行时**
3. 后端 `.env` 里配 `CORS_ORIGIN=https://你的前端.workers.dev` 放行跨域，并确保后端有公网可达的 HTTPS 地址（可用 cloudflared tunnel 内网穿透快速验证）
4. 只部署了前端而后端不可达时，页面会停在登录页且登录报错——这是预期行为

## 四、正式发布清单（小程序上线）

1. **主体与类目**：注册小程序账号。注意：**个人主体不能用「教育」类目**，语言学习工具建议选「工具」类目，名称避免「课程/培训」等需资质的用词；若用企业主体报教育类目，可能需要相关办学/资质证明
2. **服务器**：后端部署到有 **ICP 备案的 HTTPS 域名**（如经 Nginx 反代到 3000 端口）；在小程序后台把该域名加入 request、uploadFile、downloadFile 合法域名
3. **内容安全（重要）**：用户输入属于 UGC，审核要求接入安全检测——`.env` 里配 `ENABLE_WX_SECURITY=true` + `WX_APPID` + `WX_SECRET`（后端已实现 msgSecCheck，命中风险自动拦截）
4. **用户标识**：`ENABLE_WX_SECURITY` 同一组 AppID/Secret 会自动启用 code2Session，用 openid 作稳定用户 ID
5. **隐私保护**：小程序后台「用户隐私保护指引」中声明：麦克风（语音对话）、相册（上传教材图片）；`app.json` 中已有对应权限组件
6. **审核材料**：录一段演示（语音对话/纠错闭环/上传菜单学词汇），类目若涉及教育内容，准备好说明「AI 陪练工具，非在线课程」

## 五、二次开发要点

- **换主题配色**：App 为海洋主题（浅青 #E0F7FA / 天蓝 #B2EBF2 / 海蓝 #80DEEA / 深青 #4DB6AC）；聊天页底部是三层漂动海浪动画，素材在 `miniprogram/images/wave-*.png`，由 `tools/gen_waves.py` 生成——想调浪高/配色改脚本后运行 `python3 tools/gen_waves.py` 重新生成
- **改教学法**：全部在 `server/src/system-prompt.js`（纠错策略、配比、发音课程表、输出协议都是显式规则）
- **输出协议**：LLM 每轮返回 `{speech, display, state_patch, ui_hints}`——speech 给 TTS、display 给聊天气泡、state_patch 由 `agent.js` 落库（定级联动配比、SRS 复习调度、同类错误累计触发专项课都已实现）
- **SRS 间隔**：`agent.js` 里 `SRS_DAYS = [1, 3, 7, 14]`
- **换存储**：`store.js` 接口（loadUser/saveUser/resetUser）不变即可换 SQLite/Postgres
- **数据迁移**：`server/data/users/*.json` 即用户档案，注意备份
- **已知边界**：PDF/Word 暂不支持（请截图上传）；前端朗读文本最多取 400 字，云 TTS 输入最多 500 字；会话历史滚动保留 40 条

## 六、手机真机运行（含语音）

小程序 TTS 由后端合成，手机端只要能连到后端即可听到发音。网页版则优先使用浏览器本地高质量音色，缺少合适音色时再调用后端：

1. **真机预览（开发期）**：手机和电脑连同一 Wi-Fi → 查电脑局域网 IP（`ipconfig getifaddr en0`）→ 改 `miniprogram/utils/config.js` 的 `BASE_URL = 'http://<局域网IP>:3000'` → 工具栏「预览」扫码；手机端打开「开发调试」（右下角胶囊 → 开发调试）以跳过域名校验
2. **正式上线**：后端部署到 ICP 备案的 HTTPS 服务器（Edge-TTS 随服务端一起工作，无需额外配置），小程序后台配置合法域名，按「四、正式发布清单」走完
3. 后端 Edge-TTS 的韩语/中文音色和语速在 `server/.env` 调：`EDGE_TTS_VOICE_KO`、`EDGE_TTS_VOICE_ZH`、`EDGE_TTS_RATE`（如 `-15%` 更慢；旧变量 `EDGE_TTS_VOICE` 仍可作为韩语音色兼容项）。云 TTS 可通过 `TTS_BASE_URL`、`TTS_API_KEY`、`TTS_MODEL`、`TTS_VOICE` 配置，仅在 Edge-TTS 失败时尝试；macOS 本地兜底可用 `SAY_VOICE`、`SAY_RATE` 配置。

## 七、传智杯 Vibe Coding 赛道备赛

参赛版本应按官方赛道页和所在院校通知确认最终规则。当前仓库提供 README 复现步骤、环境变量模板和公开作品介绍页（网页版 `/project`）；赛道提交材料还应逐项核对公共代码仓库、可追溯的细粒度 Git 历史、真实 AI Prompt 对话快照、5–8 分钟演示视频（包含 AI 协同过程）及不超过 30 页的技术文档 PDF。项目已准备技术说明源稿 `docs/参赛技术说明.md` 与 PDF `output/pdf/传智杯VibeCoding_技术说明.pdf`。真实 Prompt 证据和实际录制的视频需要基于开发者本人会话与操作整理，不应伪造。
