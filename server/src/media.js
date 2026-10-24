// 上传图片进 VLM 前的归一化：小图上采样 + 统一转 JPEG。
// 背景（实测）：glm-4.6v 对低分辨率文字图会幻觉误读（36px 字号稳定读错，96px 全对），
// 且 data URL 曾把 PNG 字节硬标成 image/jpeg。归一化一次性解决这两个隐患：
//   1) 最长边不足 minDim 的图等比上采样（lanczos，最多 3 倍）；
//   2) 统一输出 JPEG（顺带把大 PNG 压到几分之一，减小 base64 体积）。
// ffmpeg 不可用或探测失败时返回原文件信息（降级不阻塞上传链路）。
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

// 与 llm.js 相同的绝对路径解析策略（launchd 环境 PATH 精简，必须用绝对路径）
function findBin(name, envKey) {
  const candidates = [process.env[envKey], '/opt/homebrew/bin/' + name, '/usr/local/bin/' + name, '/usr/bin/' + name]
    .filter(Boolean);
  for (const p of candidates) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) { /* 继续找 */ }
  }
  return null;
}

const FFMPEG_BIN = findBin('ffmpeg', 'FFMPEG_PATH') || 'ffmpeg';
const FFPROBE_BIN = findBin('ffprobe', 'FFPROBE_PATH') || 'ffprobe';

function probeImageSize(filePath) {
  return new Promise((resolve) => {
    execFile(FFPROBE_BIN, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'json', String(filePath)
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        const s = JSON.parse(stdout).streams && JSON.parse(stdout).streams[0];
        const w = s && Number(s.width);
        const h = s && Number(s.height);
        if (w > 0 && h > 0) return resolve({ width: w, height: h });
      } catch (e) { /* 解析失败按未知处理 */ }
      resolve(null);
    });
  });
}

// 返回 { path, mime, upscaled }；规范化输出固定为 image/jpeg
async function normalizeImageForVLM(filePath, { minDim = 1400 } = {}) {
  const size = await probeImageSize(filePath);
  if (!size) return { path: filePath, mime: 'image/jpeg', upscaled: false };

  const maxDim = Math.max(size.width, size.height);
  const needUpscale = maxDim < minDim;
  // 直接按目标边长等比放大（允许小数倍），保证放大后最长边达标
  const scale = needUpscale ? minDim / maxDim : 1;

  const out = os.tmpdir() + '/kfp_vlm_' + crypto.randomUUID().slice(0, 13) + '.jpg';
  const args = ['-y', '-i', String(filePath)];
  if (scale > 1) {
    // 放大 + 锐化 + 轻度增强对比：lanczos 放大后的软边缘对 OCR 不友好，unsharp 拉回文字轮廓
    args.push('-vf',
      'scale=trunc(iw*' + scale.toFixed(4) + '):trunc(ih*' + scale.toFixed(4) + '):flags=lanczos' +
      ',unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.12');
  }
  args.push('-q:v', '3', out);

  const done = await new Promise((resolve) => {
    execFile(FFMPEG_BIN, args, { timeout: 20000 }, (err) => resolve(!err));
  });
  if (!done || !fs.existsSync(out) || fs.statSync(out).size === 0) {
    return { path: filePath, mime: 'image/jpeg', upscaled: false };
  }
  return { path: out, mime: 'image/jpeg', upscaled: scale > 1 };
}

function cleanup(fileRef) {
  if (!fileRef) return;
  try { fs.unlinkSync(fileRef); } catch (e) { /* 已不存在则忽略 */ }
}

module.exports = { normalizeImageForVLM, cleanup, probeImageSize };
