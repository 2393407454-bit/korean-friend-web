# 한국어 친구 · 韩语学习智能体（微信小程序版）

一个可以**语音交流、上传教材图片**的韩语学习智能体，对标多邻国/流利说的系统化教学 + 真人语伴式对话。完整教学法见 `korean-friend-agent/system-prompt.md` 与 `design.md`。

```
korean-friend-app/
├── miniprogram/          # 微信小程序前端（原生框架，微信开发者工具直接导入）
│   ├── pages/chat/       #   对话页：文本/语音输入、TTS 播报、模式切换、文件上传
│   ├── pages/pronunciation/  # 发音页：跟读练习 → ASR → AI 发音反馈 + 发音评分趋势
│   ├── pages/profile/    #   档案页：定级/生词本/错误记录/进度报告
│   └── utils/            #   接口封装、TTS 播放、配置
└── server/               # Node 后端（Express）
    └── src/
        ├── agent.js          # 智能体编排：通道感知 → 状态注入 → 结构化输出 → 状态回写
        ├── system-prompt.js  # 教学法系统提示词（动态注入用户状态/复习队列/难度档位）
        ├── llm.js            # OpenAI 兼容多模态客户端（LLM/VLM/ASR/TTS）+ 演示模式
        ├── store.js          # 用户档案/生词本/SRS 复习/错误日志（JSON 存储）
        └── security.js       # 微信 msgSecCheck 内容安全 + code2Session（上线用）
```

> 注：README 早期描述过「摄像头抽帧口型纠音」，当前版本**尚未实现**该链路（前端无 camera/抽帧流程），已从文档移除，作为未来可接入的方向记录在案。

## 一、快速跑起来（约 10 分钟）

### 1. 启动后端

```bash
cd server
cp .env.example .env
npm install
npm start
```

未配置任何 Key 时是**演示模式**，前端交互全部可跑（回复为占位文案）。

### 2. 配置 AI 服务（.env）

| 能力 | 推荐方案 | 说明 |
|---|---|---|
| LLM 大脑 | 智谱 GLM（open.bigmodel.cn）| `glm-4.5-flash` 免费且指令遵从度好（实测 glm-4-flash 教学合规性差，勿用）；关闭思考模式保证响应速度 |
| 图片 OCR/教材理解 | 同上 | `glm-4.5v` 免费且韩文 OCR 准确（实测 glm-4v-flash 幻觉严重，勿用） |
| 韩语语音识别 ASR | 同上 | `glm-asr-2512` 免费额度可用，与 LLM 同一个 Key，实测韩语识别准确 |
| 韩语语音合成 TTS | **Edge-TTS（默认已接入，免费无 Key）**，韩文段 `ko-KR-SunHiNeural`、中文段 `zh-CN-XiaoxiaoNeural`（自动分段拼接，汉字中文发音、韩文韩语发音），语速可调；备选 glm-tts（需充值）/ SiliconFlow CosyVoice2 / macOS say（仅开发机） | Edge-TTS 服务端运行，手机真机同样可用 |

> 智谱模型共用同一个 API Key（ASR/LLM/视觉已实测）。TTS 默认走 Edge-TTS（免费），无需任何充值。

> ⚠️ 未配置 ASR 时，聊天页语音输入不可用（会明确提示），文字交流不受影响。

### 3. 导入小程序

1. 下载「微信开发者工具」，导入 `miniprogram/` 目录（测试号选 `touristappid`，或填自己的 AppID）
2. 「详情 → 本地设置」勾选 **不校验合法域名**（开发期）
3. 确认 `miniprogram/utils/config.js` 里 `BASE_URL` 指向你的后端地址（真机预览时改成电脑局域网 IP，如 `http://192.168.x.x:3000`）
4. 编译运行。语音权限首次使用时授权即可

## 二、正式发布清单

1. **主体与类目**：注册小程序账号。注意：**个人主体不能用「教育」类目**，语言学习工具建议选「工具」类目，名称避免「课程/培训」等需资质的用词；若用企业主体报教育类目，可能需要相关办学/资质证明
2. **服务器**：后端部署到有 **ICP 备案的 HTTPS 域名**（如经 Nginx 反代到 3000 端口）；在小程序后台把该域名加入 request、uploadFile、downloadFile 合法域名
3. **内容安全（重要）**：用户输入属于 UGC，审核要求接入安全检测——`.env` 里配 `ENABLE_WX_SECURITY=true` + `WX_APPID` + `WX_SECRET`（后端已实现 msgSecCheck，命中风险自动拦截）
4. **用户标识**：`ENABLE_WX_SECURITY` 同一组 AppID/Secret 会自动启用 code2Session，用 openid 作稳定用户 ID
5. **隐私保护**：小程序后台「用户隐私保护指引」中声明：麦克风（语音对话）、相册（上传教材图片）；`app.json` 中已有对应权限组件
6. **审核材料**：录一段演示（语音对话/纠错闭环/上传菜单学词汇），类目若涉及教育内容，准备好说明「AI 陪练工具，非在线课程」

## 三、二次开发要点

- **换主题配色**：App 为海洋主题（浅青 #E0F7FA / 天蓝 #B2EBF2 / 海蓝 #80DEEA / 深青 #4DB6AC）；聊天页底部是三层漂动海浪动画，素材在 `miniprogram/images/wave-*.png`，由 `tools/gen_waves.py` 生成——想调浪高/配色改脚本后运行 `python3 tools/gen_waves.py` 重新生成
- **改教学法**：全部在 `server/src/system-prompt.js`（纠错策略、配比、发音课程表、输出协议都是显式规则）
- **输出协议**：LLM 每轮返回 `{speech, display, state_patch, ui_hints}`——speech 给 TTS、display 给聊天气泡、state_patch 由 `agent.js` 落库（定级联动配比、SRS 复习调度、同类错误累计触发专项课都已实现）
- **SRS 间隔**：`agent.js` 里 `SRS_DAYS = [1, 3, 7, 14]`
- **换存储**：`store.js` 接口（loadUser/saveUser/resetUser）不变即可换 SQLite/Postgres
- **数据迁移**：`server/data/users/*.json` 即用户档案，注意备份
- **已知边界**：PDF/Word 暂不支持（请截图上传）；TTS 单次限 500 字；会话历史滚动保留 40 条

## 九、手机真机运行（含语音）

Edge-TTS 在后端运行，手机端只要能连到后端即可听到发音：

1. **真机预览（开发期）**：手机和电脑连同一 Wi-Fi → 查电脑局域网 IP（`ipconfig getifaddr en0`）→ 改 `miniprogram/utils/config.js` 的 `BASE_URL = 'http://<局域网IP>:3000'` → 工具栏「预览」扫码；手机端打开「开发调试」（右下角胶囊 → 开发调试）以跳过域名校验
2. **正式上线**：后端部署到 ICP 备案的 HTTPS 服务器（Edge-TTS 随服务端一起工作，无需额外配置），小程序后台配置合法域名，按「二、正式发布清单」走完
3. 音色/语速在 `server/.env` 调：`EDGE_TTS_VOICE`（如 ko-KR-InJoonNeural 男声）、`EDGE_TTS_RATE`（如 -15% 更慢）
