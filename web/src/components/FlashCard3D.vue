<script setup>
// 3D 单词翻转卡：three.js 双面卡片，点击翻面，可轻微拖动倾斜
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  word: { type: Object, required: true },
  flipped: { type: Boolean, default: false },
  tag: { type: String, default: '한국어 · 단어' }
});
const emit = defineEmits(['toggle']);

const canvasEl = ref(null);
const failed = ref(false);

let THREE = null;
let renderer = null;
let scene = null;
let camera = null;
let cardGroup = null;
let cardBody = null;
let frontMesh = null;
let backMesh = null;
let animId = 0;
let clock = null;
let resizeObserver = null;
let frontTex = null;
let backTex = null;

let targetY = 0;
let tiltX = 0;
let tiltZ = 0;
let pointerDown = false;
let moved = 0;
let lastX = 0;
let lastY = 0;

const CARD_W = 3.24;
const CARD_H = 2.02;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  let line = '';
  chars.forEach((ch) => {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function paintFace(flipped) {
  const W = 1024;
  const H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 卡面底：整张画布铺暖白，圆角由几何体负责，避免 UV 采样到透明角落
  ctx.fillStyle = '#F3EEDF';
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#D8CFBD';
  roundRect(ctx, 8, 8, W - 16, H - 16, 48);
  ctx.stroke();

  const accent = flipped ? '#A87946' : '#385862';
  roundRect(ctx, 54, 48, 214, 56, 28);
  ctx.fillStyle = flipped ? 'rgba(168,121,70,0.12)' : 'rgba(56,88,98,0.10)';
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = '600 28px "PingFang SC", "Noto Sans KR", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(flipped ? '释义' : props.tag, 76, 77);

  if (!flipped) {
    const word = String(props.word.v || '');
    const size = word.length > 7 ? 96 : (word.length > 5 ? 112 : 132);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#141519';
    ctx.font = `800 ${size}px "PingFang SC", "Noto Sans KR", system-ui, sans-serif`;
    ctx.fillText(word, W / 2, 286, W - 120);

    ctx.fillStyle = '#8A8C94';
    ctx.font = '500 46px "PingFang SC", system-ui, sans-serif';
    ctx.fillText(String(props.word.r || ''), W / 2, 392, W - 160);

    // 底部提示 + 圆点装饰
    ctx.fillStyle = '#C7C6C0';
    ctx.beginPath();
    ctx.arc(W / 2, 512, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#90929A';
    ctx.font = '500 34px "PingFang SC", system-ui, sans-serif';
    ctx.fillText('点击卡片翻面', W / 2, 560);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#141519';
    ctx.font = '800 100px "PingFang SC", "Noto Sans KR", system-ui, sans-serif';
    ctx.fillText(String(props.word.m || ''), W / 2, 215, W - 120);

    ctx.fillStyle = '#55565C';
    ctx.font = '600 52px "PingFang SC", "Noto Sans KR", system-ui, sans-serif';
    const lines = wrapText(ctx, props.word.ex || '', W - 200);
    lines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, W / 2, 320 + i * 68);
    });

    ctx.fillStyle = '#90929A';
    ctx.font = '500 40px "PingFang SC", system-ui, sans-serif';
    const zhLines = wrapText(ctx, props.word.exZh || '', W - 200);
    zhLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, W / 2, 470 + i * 54);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

function applyTextures() {
  if (!THREE) return;
  if (frontTex) frontTex.dispose();
  if (backTex) backTex.dispose();
  frontTex = paintFace(false);
  backTex = paintFace(true);
  if (frontMesh) frontMesh.material.map = frontTex;
  if (backMesh) backMesh.material.map = backTex;
  if (frontMesh) frontMesh.material.needsUpdate = true;
  if (backMesh) backMesh.material.needsUpdate = true;
}

function init() {
  const el = canvasEl.value;
  if (!el) return;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    failed.value = true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40);
  camera.position.set(0, 0, 6.25);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2.5, 3.5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe8c995, 0.48);
  rim.position.set(-4, -2, 2);
  scene.add(rim);

  const shape = new THREE.Shape();
  const w = CARD_W;
  const h = CARD_H;
  const r = 0.16;
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geo = new THREE.ShapeGeometry(shape, 24);
  // ShapeGeometry 的默认 UV 是顶点坐标本身（超出 0~1），必须重映射到贴图范围
  const pos = geo.attributes.position;
  const uv = [];
  for (let i = 0; i < pos.count; i += 1) {
    uv.push((pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

  const bodyGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.035, bevelThickness: 0.025
  });
  bodyGeometry.translate(0, 0, -0.05);
  cardBody = new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: 0x36545a, roughness: 0.58, metalness: 0.06 }));
  cardBody.castShadow = true;
  cardBody.receiveShadow = true;

  // 卡面是纯贴图，用 Basic 材质保证文字与底色不被光照压暗
  // 位置必须在 ExtrudeGeometry 端盖之外：depth 0.1 + 两端 bevelThickness 0.025
  // 使卡体实际跨越 z ±0.075，贴面若放在 ±0.058 会被卡体端盖完全遮挡（单词不可见）
  frontMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xffffff, toneMapped: false
  }));
  frontMesh.position.z = 0.076;

  backMesh = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
    color: 0xffffff, toneMapped: false
  }));
  backMesh.position.z = -0.076;
  backMesh.rotation.y = Math.PI;

  cardGroup = new THREE.Group();
  cardGroup.add(cardBody, frontMesh, backMesh);
  scene.add(cardGroup);

  applyTextures();
  clock = new THREE.Clock();
  resize();
  animate();

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(el);

  const dom = renderer.domElement;
  dom.style.touchAction = 'none';
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
  dom.addEventListener('pointerleave', onUp);
}

function resize() {
  const el = canvasEl.value;
  if (!el || !renderer || !camera) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera || !cardGroup) return;
  const t = clock.getElapsedTime();
  targetY = props.flipped ? Math.PI : 0;
  cardGroup.rotation.y += (targetY - cardGroup.rotation.y) * 0.12;
  cardGroup.rotation.x += (tiltX - cardGroup.rotation.x) * 0.1;
  cardGroup.rotation.z += (tiltZ - cardGroup.rotation.z) * 0.1;
  cardGroup.position.y = Math.sin(t * 0.9) * 0.045;
  renderer.render(scene, camera);
}

function onDown(e) {
  pointerDown = true;
  moved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  if (renderer) renderer.domElement.setPointerCapture(e.pointerId);
}

function onMove(e) {
  const el = canvasEl.value;
  if (!el) return;
  if (!pointerDown) {
    // 悬停时轻微倾斜，提示可交互
    const rect = el.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    tiltX = ny * 0.12;
    tiltZ = -nx * 0.1;
    return;
  }
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  tiltX = Math.max(-0.35, Math.min(0.35, tiltX + dy * 0.004));
  tiltZ = Math.max(-0.35, Math.min(0.35, tiltZ - dx * 0.004));
}

function onUp(e) {
  if (!pointerDown) return;
  pointerDown = false;
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  if (moved < 7) emit('toggle');
}

watch(() => props.word, () => applyTextures(), { deep: true });
watch(() => props.tag, () => applyTextures());

onMounted(async () => {
  try {
    const mod = await import('three');
    THREE = mod;
    init();
  } catch (e) {
    console.error('[FlashCard3D] three.js 加载失败', e);
    failed.value = true;
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animId);
  if (resizeObserver) resizeObserver.disconnect();
  if (renderer) {
    const dom = renderer.domElement;
    dom.removeEventListener('pointerdown', onDown);
    dom.removeEventListener('pointermove', onMove);
    dom.removeEventListener('pointerup', onUp);
    dom.removeEventListener('pointercancel', onUp);
    dom.removeEventListener('pointerleave', onUp);
    renderer.dispose();
    if (dom.parentNode) dom.parentNode.removeChild(dom);
  }
  if (frontTex) frontTex.dispose();
  if (backTex) backTex.dispose();
  if (cardBody && cardBody.geometry) cardBody.geometry.dispose();
  renderer = null;
  scene = null;
  camera = null;
  cardGroup = null;
  cardBody = null;
});
</script>

<template>
  <div class="flash-3d">
    <div
      ref="canvasEl"
      class="flash-canvas"
      role="button"
      tabindex="0"
      :aria-label="flipped ? '单词释义，按回车翻回' : '3D 单词卡，按回车翻面'"
      @keydown.enter.prevent="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    ></div>
    <div
      v-if="failed"
      class="flash-fallback"
      role="button"
      tabindex="0"
      :aria-label="flipped ? '单词释义，按回车翻回' : '单词卡，按回车查看释义'"
      @click="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    >
      <template v-if="!flipped">
        <div class="ff-word">{{ word.v }}</div>
        <div class="ff-roman">{{ word.r }}</div>
        <div class="ff-hint">点击翻面 · {{ word.tag || '查看释义' }}</div>
      </template>
      <template v-else>
        <div class="ff-meaning">{{ word.m }}</div>
        <div class="ff-ex">{{ word.ex }}</div>
        <div class="ff-ex ff-ex-zh">{{ word.exZh }}</div>
        <div class="ff-hint">点击翻回单词</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.flash-3d {
  position: relative;
  height: 250px;
  margin: 6px 0 2px;
  border-radius: var(--radius-l);
  background:
    radial-gradient(ellipse 70% 60% at 50% 40%, rgba(177, 138, 88, 0.12) 0%, transparent 70%),
    linear-gradient(180deg, #F3EFE5 0%, #E8E1D3 100%);
  overflow: hidden;
}
.flash-canvas { position: absolute; inset: 0; cursor: pointer; }
.flash-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  user-select: none;
}
.ff-word { font-size: 30px; font-weight: 800; }
.ff-roman { font-size: 13px; color: var(--ink-3); }
.ff-meaning { margin-top: 10px; font-size: 18px; font-weight: 700; }
.ff-ex { font-size: 13px; color: var(--ink-2); }
.ff-ex-zh { color: var(--ink-3); }
.ff-hint { margin-top: 12px; font-size: 11px; color: var(--ink-3); }
</style>
