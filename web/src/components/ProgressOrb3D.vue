<script setup>
// 3D 学习通行证：纸张、压印边缘与旅行路线纹样，拖动可查看卡片厚度。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  title: { type: String, default: '初来者' },
  pct: { type: Number, default: 0 }
});

const canvasEl = ref(null);
const failed = ref(false);
let THREE = null;
let renderer = null;
let scene = null;
let camera = null;
let pass = null;
let animId = 0;
let clock = null;
let resizeObserver = null;
let faceTexture = null;
let pointerDown = false;
let moved = 0;
let lastX = 0;
let lastY = 0;
let targetY = -0.16;
let targetX = 0.035;

function paintPass() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2ead9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#324e58';
  ctx.fillRect(0, 0, 18, canvas.height);
  ctx.strokeStyle = 'rgba(56,72,71,.24)';
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 34, 948, 532);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#83765e';
  ctx.font = '700 27px sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('SEOUL LANGUAGE CLUB', 76, 88);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = '#243f49';
  ctx.font = '700 142px Georgia, serif';
  ctx.fillText(`LV.${props.level}`, 73, 283);
  ctx.fillStyle = '#8a6139';
  ctx.font = '600 34px sans-serif';
  ctx.fillText(props.title, 78, 365);
  ctx.fillStyle = '#77786f';
  ctx.font = '500 23px sans-serif';
  ctx.fillText(`${props.xp} XP  ·  NEXT LEVEL ${props.pct}%`, 80, 423);

  const startX = 82, endX = 940, routeY = 500;
  ctx.strokeStyle = '#ad8756';
  ctx.lineWidth = 4;
  ctx.setLineDash([7, 12]);
  ctx.beginPath(); ctx.moveTo(startX, routeY); ctx.lineTo(endX, routeY); ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 6; i += 1) {
    const x = startX + ((endX - startX) * i) / 5;
    ctx.beginPath();
    ctx.arc(x, routeY, i === 5 ? 12 : 8, 0, Math.PI * 2);
    ctx.fillStyle = i === 5 ? '#ad8756' : '#f2ead9';
    ctx.fill();
    ctx.strokeStyle = '#ad8756'; ctx.lineWidth = 3; ctx.stroke();
  }

  faceTexture = new THREE.CanvasTexture(canvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  if (renderer) faceTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return faceTexture;
}

function ticketShape() {
  const w = 2.3, h = 1.34, r = 0.1;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

function clearPass() {
  if (!pass) return;
  scene.remove(pass);
  pass.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => { if (material.map) material.map.dispose(); material.dispose(); });
    }
  });
  pass = null;
  if (faceTexture) { faceTexture.dispose(); faceTexture = null; }
}

function buildPass() {
  if (!THREE || !scene) return;
  clearPass();
  pass = new THREE.Group();
  pass.rotation.set(targetX, targetY, 0);
  scene.add(pass);

  const shape = ticketShape();
  const backing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.035, bevelThickness: 0.035 }),
    new THREE.MeshStandardMaterial({ color: 0x304b54, roughness: 0.58, metalness: 0.08 })
  );
  backing.position.z = -0.08;
  backing.castShadow = true;
  backing.receiveShadow = true;
  pass.add(backing);

  const faceGeometry = new THREE.ShapeGeometry(shape, 24);
  const position = faceGeometry.attributes.position;
  const uv = [];
  for (let i = 0; i < position.count; i += 1) {
    uv.push((position.getX(i) + 1.15) / 2.3, (position.getY(i) + 0.67) / 1.34);
  }
  faceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const face = new THREE.Mesh(
    faceGeometry,
    new THREE.MeshBasicMaterial({ map: paintPass(), side: THREE.DoubleSide })
  );
  // 背板前表面在 z=0.075（position -0.08 + depth 0.12 + bevel 0.035），卡面必须在其前方才能露出
  face.position.z = 0.09;
  pass.add(face);

  // Embossed metallic corner studs echo the pins on the course map.
  const studMaterial = new THREE.MeshStandardMaterial({ color: 0xb18a58, roughness: 0.32, metalness: 0.66 });
  [[-1.02, -0.51], [1.02, -0.51], [-1.02, 0.51], [1.02, 0.51]].forEach(([x, y]) => {
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), studMaterial.clone());
    stud.position.set(x, y, 0.075);
    pass.add(stud);
  });
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera || !pass) return;
  const t = clock.getElapsedTime();
  if (!pointerDown && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targetY += (-0.16 + Math.sin(t * 0.34) * 0.16 - targetY) * 0.018;
    targetX += (0.035 + Math.sin(t * 0.26) * 0.045 - targetX) * 0.018;
  }
  pass.rotation.y += (targetY - pass.rotation.y) * 0.09;
  pass.rotation.x += (targetX - pass.rotation.x) * 0.09;
  pass.position.y = Math.sin(t * 0.85) * 0.035;
  renderer.render(scene, camera);
}

function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (error) { failed.value = true; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  canvasEl.value.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(37, 1, 0.1, 30);
  camera.position.set(0, 0, 4.3);
  scene.add(new THREE.AmbientLight(0xffffff, 1.35));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
  key.position.set(-2, 3, 5);
  key.castShadow = true;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8eabb0, 0.8);
  fill.position.set(3, -1, 2);
  scene.add(fill);
  clock = new THREE.Clock();
  buildPass();
  resize();
  animate();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvasEl.value);
  const dom = renderer.domElement;
  dom.style.touchAction = 'none';
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
}

function resize() {
  if (!canvasEl.value || !renderer || !camera) return;
  const width = canvasEl.value.clientWidth, height = canvasEl.value.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function onDown(event) {
  pointerDown = true;
  moved = 0;
  lastX = event.clientX;
  lastY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
}
function onMove(event) {
  if (!pointerDown) {
    const rect = canvasEl.value.getBoundingClientRect();
    targetY = ((event.clientX - rect.left) / rect.width - 0.5) * -0.3;
    targetX = ((event.clientY - rect.top) / rect.height - 0.5) * 0.12;
    return;
  }
  const dx = event.clientX - lastX, dy = event.clientY - lastY;
  moved += Math.abs(dx) + Math.abs(dy);
  lastX = event.clientX; lastY = event.clientY;
  targetY += dx * 0.006;
  targetX = Math.max(-0.28, Math.min(0.28, targetX + dy * 0.004));
}
function onUp(event) {
  pointerDown = false;
  try { renderer.domElement.releasePointerCapture(event.pointerId); } catch (error) { /* pointer may already be released */ }
}

watch(() => [props.xp, props.level, props.title, props.pct], () => buildPass());
onMounted(async () => {
  try { THREE = await import('three'); init(); }
  catch (error) { console.error('[ProgressPass3D] three.js 加载失败', error); failed.value = true; }
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
    clearPass();
    renderer.dispose();
    dom.remove();
  }
  renderer = null; scene = null; camera = null;
});
</script>

<template>
  <div class="pass-wrap">
    <div ref="canvasEl" class="pass-canvas" aria-label="3D 学习通行证，拖动查看卡片"></div>
    <div v-if="failed" class="pass-fallback">
      <span class="pass-fallback-kicker">SEOUL LANGUAGE CLUB</span>
      <strong>LV.{{ level }}</strong>
      <span>{{ title }} · {{ xp }} XP · {{ pct }}%</span>
    </div>
    <span class="pass-hint">拖动通行证查看立体边缘</span>
  </div>
</template>

<style scoped>
.pass-wrap {
  position: relative;
  height: 220px;
  overflow: hidden;
  border-radius: var(--radius-l);
  background:
    radial-gradient(ellipse 75% 70% at 50% 48%, rgba(239, 226, 201, .82), transparent 73%),
    linear-gradient(180deg, #f3eee3, #e8e2d5);
}
.pass-canvas { position: absolute; inset: 0; cursor: grab; touch-action: none; }
.pass-canvas:active { cursor: grabbing; }
.pass-canvas :deep(canvas) { display: block; width: 100%; height: 100%; }
.pass-hint { position: absolute; left: 0; right: 0; bottom: 7px; color: #8b857a; font-size: 9px; text-align: center; pointer-events: none; }
.pass-fallback { position: absolute; inset: 22px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 1px solid rgba(50,75,84,.24); border-radius: 8px; background: #f2ead9; box-shadow: 0 7px 0 #304b54; color: #304b54; }
.pass-fallback-kicker { color: #83765e; font-size: 8px; letter-spacing: .16em; }
.pass-fallback strong { font: 700 31px Georgia, serif; }
.pass-fallback span:last-child { color: #77786f; font-size: 10px; }
@media (prefers-reduced-motion: reduce) { .pass-hint { transition: none; } }
</style>
