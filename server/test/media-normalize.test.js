const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const media = require('../src/media');

const hasFFmpeg = (() => {
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) {
    try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (e) { /* 找下一个 */ }
  }
  return false;
})();

// 小尺寸 PNG（模拟手机截图里的低分辨率文字图）
function makeTinyPng(dir) {
  const file = path.join(dir, 'tiny.png');
  execFileSync('/opt/homebrew/bin/ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x160',
    '-vf', 'drawtext=text=Test:fontcolor=black:fontsize=24:x=20:y=60',
    '-frames:v', '1', file
  ], { stdio: 'ignore' });
  return file;
}

test('probeImageSize reads dimensions', async (t) => {
  if (!hasFFmpeg) t.skip('本机无 ffmpeg，跳过媒体测试');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfp-media-'));
  const file = makeTinyPng(dir);
  const size = await media.probeImageSize(file);
  assert.ok(size && size.width === 320 && size.height === 160, '应读到 320x160，实际 ' + JSON.stringify(size));
  media.cleanup(dir);
});

test('normalizeImageForVLM upscales small images and outputs jpeg', async (t) => {
  if (!hasFFmpeg) t.skip('本机无 ffmpeg，跳过媒体测试');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfp-media-'));
  const file = makeTinyPng(dir);
  const norm = await media.normalizeImageForVLM(file);
  try {
    assert.equal(norm.mime, 'image/jpeg');
    assert.equal(norm.upscaled, true, '320px 小图应触发上采样');
    assert.notEqual(norm.path, file, '应输出新的归一化文件');
    const size = await media.probeImageSize(norm.path);
    assert.ok(size && size.width >= 1400, '放大后最长边应 ≥1400，实际 ' + JSON.stringify(size));
  } finally {
    media.cleanup(norm.path);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('normalizeImageForVLM keeps large images without upscaling', async (t) => {
  if (!hasFFmpeg) t.skip('本机无 ffmpeg，跳过媒体测试');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfp-media-'));
  const file = path.join(dir, 'big.png');
  execFileSync('/opt/homebrew/bin/ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'testsrc=s=1920x1080', '-frames:v', '1', file
  ], { stdio: 'ignore' });
  const norm = await media.normalizeImageForVLM(file);
  try {
    assert.equal(norm.upscaled, false, '1920px 大图不应放大');
    assert.equal(norm.mime, 'image/jpeg');
  } finally {
    if (norm.path !== file) media.cleanup(norm.path);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('normalizeImageForVLM degrades gracefully on missing file', async () => {
  const norm = await media.normalizeImageForVLM('/nonexistent/no-such-image.png');
  assert.equal(norm.path, '/nonexistent/no-such-image.png');
  assert.equal(norm.upscaled, false);
});
