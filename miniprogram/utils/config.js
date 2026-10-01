// 后端地址配置
//
// ============================================================
// 【环境切换】只改下面这一行：
//   'dev'  = 本地开发：电脑跑后端，手机/开发者工具连同一 WiFi
//   'prod' = 线上部署：云服务器 + HTTPS 域名，评委扫码即可用
// ============================================================
const ENV = 'dev';

// ---- dev：开发调试用，填你电脑的局域网 IP ----
// 查看方式：macOS 终端执行  ipconfig getifaddr en0
// 换了电脑或网络，只改这一行
const DEV_HOST = '192.168.0.106';

// ---- prod：线上地址，备案完成 + HTTPS 配好后填这里 ----
// 注意：必须是 https，且不要带结尾斜杠
// 例如：https://korean.yourdomain.com
const PROD_HOST = 'https://example.com';

const ENV_MAP = {
  dev: {
    BASE_URL: `http://${DEV_HOST}:3000`,
    // 本地调试需要在开发者工具「详情 - 本地设置」勾上「不校验合法域名」
    ENV_NAME: 'dev'
  },
  prod: {
    BASE_URL: PROD_HOST,
    // 上线前必须在「小程序后台 - 开发管理 - 服务器域名」配置：
    //   request 合法域名 / uploadFile 合法域名 / downloadFile 合法域名
    ENV_NAME: 'prod'
  }
};

module.exports = ENV_MAP[ENV] || ENV_MAP.dev;
