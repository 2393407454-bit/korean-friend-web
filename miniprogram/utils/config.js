// 后端地址配置
//
// 开发调试时直接连接电脑局域网地址。
// 真机调试：在开发者工具「详情-本地设置」勾上「不校验合法域名」
// 上线前：改为 https 备案域名，并在小程序后台加 request/uploadFile/downloadFile 合法域名

// 这里必须是纯小程序代码：不能读取 Node.js 的 process/env。
// 如果换了电脑或网络，只改这一行的局域网 IP 即可。
const LAN_HOST = '172.20.10.3';

module.exports = {
  BASE_URL: `http://${LAN_HOST}:3000`
};
