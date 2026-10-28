<script setup>
// 纸雕韩屋学习庭院：每个级别只呈现 6 个单元，减少视觉噪声并保留点选、旋转与缩放。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { LEVELS, levelUnlockInfo, unitCompletion } from '../data/korean-course';

const props = defineProps({
  progress: { type: Object, default: () => ({}) },
  activeLevel: { type: String, default: 'A1' },
  selectedUnit: { type: String, default: '' }
});
const emit = defineEmits(['select-unit', 'select-level']);

const canvasEl = ref(null);
const failed = ref(false);
let THREE = null;
let renderer = null;
let scene = null;
let camera = null;
let courtyard = null;
let frame = 0;
let resizeObserver = null;
let intersectionObserver = null;
let raycaster = null;
let pointer = null;
let clock = null;
let pickables = [];
let selectedStation = null;
let inViewport = true;

const pointerMap = new Map();
let pinchDistance = 0;
let dragging = false;
let moved = 0;
let lastX = 0;
let lastY = 0;
let rotX = -0.08;
let rotY = -0.18;
const targetRotation = { x: rotX, y: rotY };
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const LEVEL_TINT = { A1: 0x244d50, A2: 0x68735a, B1: 0xa45f43 };
const NODE_X = [-4.1, -2.46, -0.82, 0.82, 2.46, 4.1];

function disposeTree(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

function makeLabel(text, color = '#243a3b', size = 48, width = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.font = `650 ${size}px "PingFang SC", "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, 56, width - 20);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.46, 0.32, 1);
  return sprite;
}

function paperMaterial(color, roughness = 0.88) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.01 });
}

function addHanok() {
  const hanok = new THREE.Group();
  hanok.position.set(0, 0.05, -1.55);

  const stone = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.18, 2.05), paperMaterial(0xcac3b5));
  stone.position.y = 0.09;
  stone.receiveShadow = true;
  hanok.add(stone);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.15, 1.72), paperMaterial(0x9b8062));
  floor.position.y = 0.25;
  floor.castShadow = true;
  hanok.add(floor);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.25, 1.15, 1.35), paperMaterial(0xeee9dc));
  wall.position.y = 0.88;
  wall.castShadow = true;
  wall.receiveShadow = true;
  hanok.add(wall);

  const timber = paperMaterial(0x354b49, 0.72);
  [-1.55, -0.78, 0, 0.78, 1.55].forEach((x) => {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.34, 0.09), timber.clone());
    column.position.set(x, 0.91, 0.72);
    column.castShadow = true;
    hanok.add(column);
  });
  [-1.12, -0.38, 0.38, 1.12].forEach((x) => {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.86), new THREE.MeshStandardMaterial({ color: 0xd7d8c8, roughness: 0.96, side: THREE.DoubleSide }));
    door.position.set(x, 0.82, 0.727);
    hanok.add(door);
    for (let i = -1; i <= 1; i += 1) {
      const lattice = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.82, 0.018), timber.clone());
      lattice.position.set(x + i * 0.16, 0.82, 0.742);
      hanok.add(lattice);
    }
  });

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-2.02, 0.2);
  roofShape.quadraticCurveTo(-1.52, 0.06, -1.1, -0.04);
  roofShape.quadraticCurveTo(-0.52, 0.06, 0, 0.52);
  roofShape.quadraticCurveTo(0.52, 0.06, 1.1, -0.04);
  roofShape.quadraticCurveTo(1.52, 0.06, 2.02, 0.2);
  roofShape.lineTo(1.88, -0.12);
  roofShape.quadraticCurveTo(1.0, -0.22, 0, 0.28);
  roofShape.quadraticCurveTo(-1.0, -0.22, -1.88, -0.12);
  roofShape.closePath();
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roofShape, { depth: 1.75, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.035, bevelThickness: 0.035 }),
    paperMaterial(0x263e40, 0.62)
  );
  roof.position.set(0, 1.58, -0.87);
  roof.castShadow = true;
  hanok.add(roof);

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.07, 1.93), paperMaterial(0x1c3031, 0.55));
  ridge.position.set(0, 2.12, 0.01);
  hanok.add(ridge);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.28, 0.05), paperMaterial(0x233c3d));
  sign.position.set(0, 1.38, 0.79);
  hanok.add(sign);
  const signLabel = makeLabel('한국어', '#eee9dc', 49);
  signLabel.scale.set(0.65, 0.16, 1);
  signLabel.position.set(0, 1.39, 0.825);
  hanok.add(signLabel);

  courtyard.add(hanok);
}

function addStation(unit, index, locked, pct) {
  const group = new THREE.Group();
  const selected = props.selectedUnit === unit.id;
  const tint = locked ? 0xa8a79f : LEVEL_TINT[props.activeLevel];
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, 0.12, 40), paperMaterial(selected ? 0xdfff69 : 0xe6e0d3));
  base.position.y = 0.09;
  base.castShadow = true;
  group.add(base);

  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.74, 0.075),
    new THREE.MeshStandardMaterial({ color: locked ? 0xc6c4ba : tint, roughness: 0.72, transparent: true, opacity: locked ? 0.62 : 1 })
  );
  card.position.y = 0.53;
  card.rotation.x = -0.08;
  card.castShadow = true;
  card.userData = { unitId: unit.id, locked };
  group.add(card);
  pickables.push(card);

  const number = makeLabel(String(index + 1).padStart(2, '0'), locked ? '#65665f' : '#f7f4eb', 58);
  number.scale.set(0.48, 0.18, 1);
  number.position.set(0, 0.59, 0.07);
  group.add(number);

  const label = makeLabel(unit.zh, locked ? '#8b8a82' : '#273d3e', 44);
  label.position.set(0, 1.15, 0);
  group.add(label);

  if (!locked && pct > 0) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.026, 8, 40, Math.PI * 2 * Math.max(0.06, pct / 100)),
      new THREE.MeshBasicMaterial({ color: pct >= 50 ? 0xdfff69 : 0x315f60 })
    );
    arc.rotation.x = Math.PI / 2;
    arc.position.y = 0.17;
    group.add(arc);
  }

  group.position.set(NODE_X[index], 0, 1.48 + (index % 2 ? 0.13 : -0.13));
  group.userData.baseY = 0;
  group.userData.selected = selected;
  courtyard.add(group);
  if (selected) selectedStation = group;
}

function addLandscape() {
  const shrubMat = paperMaterial(0x7c8972);
  [[-4.55, -1.85, .48], [4.45, -1.8, .62], [-4.75, -.65, .34], [4.65, -.45, .38]].forEach(([x, z, s]) => {
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), shrubMat.clone());
    shrub.scale.y = 0.78;
    shrub.position.set(x, s * 0.68, z);
    shrub.castShadow = true;
    courtyard.add(shrub);
  });
  [-4.9, 4.9].forEach((x) => {
    const lantern = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.07, .72, .07), paperMaterial(0x6f6c61));
    stem.position.y = .36;
    lantern.add(stem);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.28, .34, .28), paperMaterial(0xe7dcc4));
    lamp.position.y = .78;
    lantern.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.27, .14, 4), paperMaterial(0x314746));
    cap.position.y = 1.02;
    cap.rotation.y = Math.PI / 4;
    lantern.add(cap);
    lantern.position.set(x, 0, .25);
    courtyard.add(lantern);
  });
}

function buildCourtyard() {
  if (!THREE || !scene) return;
  if (courtyard) {
    scene.remove(courtyard);
    disposeTree(courtyard);
  }
  pickables = [];
  selectedStation = null;
  courtyard = new THREE.Group();
  courtyard.rotation.set(targetRotation.x, targetRotation.y, 0);
  scene.add(courtyard);

  const base = new THREE.Mesh(new THREE.BoxGeometry(11.15, 0.22, 6.15), paperMaterial(0xe4ded1));
  base.position.y = -0.13;
  base.receiveShadow = true;
  courtyard.add(base);
  const inset = new THREE.Mesh(new THREE.PlaneGeometry(10.72, 5.72), new THREE.MeshStandardMaterial({ color: 0xf1ede3, roughness: 1 }));
  inset.rotation.x = -Math.PI / 2;
  inset.position.y = 0.006;
  inset.receiveShadow = true;
  courtyard.add(inset);

  addHanok();
  addLandscape();

  const levelIndex = LEVELS.findIndex((level) => level.id === props.activeLevel);
  const level = LEVELS[levelIndex] || LEVELS[0];
  const locked = !levelUnlockInfo(props.progress, levelIndex).unlocked;
  const points = NODE_X.map((x, i) => new THREE.Vector3(x, 0.075, 1.48 + (i % 2 ? 0.13 : -0.13)));
  const route = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.032, 8, false),
    new THREE.MeshStandardMaterial({ color: locked ? 0xb4b1a8 : LEVEL_TINT[level.id], roughness: 0.75, transparent: true, opacity: locked ? 0.35 : 0.8 })
  );
  courtyard.add(route);
  level.units.forEach((unit, index) => addStation(unit, index, locked, unitCompletion(props.progress, unit)));

  const levelLabel = makeLabel(`${level.id}  ·  ${level.title}`, '#5e6a64', 40);
  levelLabel.scale.set(2.1, 0.32, 1);
  levelLabel.position.set(-3.95, 0.32, -2.65);
  courtyard.add(levelLabel);
}

function animate() {
  frame = 0;
  if (!inViewport || document.hidden || !renderer || !scene || !camera) return;
  frame = requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  if (courtyard) {
    if (!dragging && !reducedMotion?.matches) targetRotation.y = rotY + Math.sin(t * 0.3) * 0.025;
    courtyard.rotation.y += (targetRotation.y - courtyard.rotation.y) * 0.075;
    courtyard.rotation.x += (targetRotation.x - courtyard.rotation.x) * 0.075;
  }
  if (selectedStation && !reducedMotion?.matches) selectedStation.position.y = selectedStation.userData.baseY + Math.sin(t * 2.2) * 0.04;
  renderer.render(scene, camera);
}

function syncAnimation() {
  if (inViewport && !document.hidden && !frame) animate();
  if ((!inViewport || document.hidden) && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

function init() {
  if (!canvasEl.value) return;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    failed.value = true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasEl.value.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xefede6, 15, 26);
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 7.2, 11.8);
  camera.lookAt(0, 0.5, 0);
  scene.add(new THREE.HemisphereLight(0xfffdf4, 0x7b8278, 2.1));
  const keyLight = new THREE.DirectionalLight(0xfff8e9, 2.5);
  keyLight.position.set(-4, 9, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(512, 512);
  scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0xb9d0cf, 0.8);
  fill.position.set(6, 3, -4);
  scene.add(fill);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  clock = new THREE.Clock();
  buildCourtyard();
  resize();
  syncAnimation();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvasEl.value);
  intersectionObserver = new IntersectionObserver(([entry]) => {
    inViewport = entry.isIntersecting;
    syncAnimation();
  }, { rootMargin: '120px' });
  intersectionObserver.observe(canvasEl.value);
  document.addEventListener('visibilitychange', syncAnimation);

  const dom = renderer.domElement;
  dom.style.touchAction = 'pan-y';
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);
  dom.addEventListener('wheel', onWheel, { passive: false });
}

function resize() {
  if (!canvasEl.value || !renderer || !camera) return;
  const { clientWidth: width, clientHeight: height } = canvasEl.value;
  if (!width || !height) return;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setPointer(event) {
  const rect = canvasEl.value.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}

function pickAt(event) {
  setPointer(event);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (!hit || hit.object.userData.locked) return;
  emit('select-unit', hit.object.userData.unitId);
}

function onPointerDown(event) {
  pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
  renderer.domElement.setPointerCapture(event.pointerId);
  if (pointerMap.size > 1) {
    const points = [...pointerMap.values()];
    pinchDistance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    dragging = false;
    moved = 8;
    return;
  }
  dragging = true;
  moved = 0;
  lastX = event.clientX;
  lastY = event.clientY;
}

function onPointerMove(event) {
  if (pointerMap.has(event.pointerId)) {
    pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMap.size > 1) {
      const points = [...pointerMap.values()];
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      if (pinchDistance) camera.position.setLength(Math.max(11.5, Math.min(17.5, camera.position.length() + (pinchDistance - distance) * 0.022)));
      pinchDistance = distance;
      moved = 8;
      return;
    }
  } else if (!dragging) {
    setPointer(event);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    renderer.domElement.style.cursor = hit && !hit.object.userData.locked ? 'pointer' : 'grab';
    return;
  }
  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  rotY = Math.max(-0.42, Math.min(0.42, rotY + dx * 0.002));
  rotX = Math.max(-0.2, Math.min(0.08, rotX + dy * 0.0012));
  targetRotation.y = rotY;
  targetRotation.x = rotX;
}

function onPointerUp(event) {
  const wasMultiTouch = pointerMap.size > 1;
  pointerMap.delete(event.pointerId);
  if (wasMultiTouch || pointerMap.size) {
    dragging = false;
    pinchDistance = 0;
    return;
  }
  if (!dragging) return;
  dragging = false;
  if (moved < 8) pickAt(event);
}

function onWheel(event) {
  event.preventDefault();
  camera.position.setLength(Math.max(11.5, Math.min(17.5, camera.position.length() + event.deltaY * 0.007)));
}

watch(() => [props.activeLevel, props.selectedUnit, JSON.stringify(props.progress)], () => buildCourtyard());

onMounted(async () => {
  try {
    THREE = await import('three');
    init();
  } catch (error) {
    console.error('[CourseMap3D] three.js 加载失败', error);
    failed.value = true;
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  if (resizeObserver) resizeObserver.disconnect();
  if (intersectionObserver) intersectionObserver.disconnect();
  document.removeEventListener('visibilitychange', syncAnimation);
  if (renderer) {
    const dom = renderer.domElement;
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('pointercancel', onPointerUp);
    dom.removeEventListener('wheel', onWheel);
    if (courtyard) disposeTree(courtyard);
    renderer.dispose();
    dom.remove();
  }
  renderer = null;
  scene = null;
  camera = null;
  courtyard = null;
});
</script>

<template>
  <section class="atlas" aria-label="韩语课程 3D 纸雕学习庭院">
    <div class="atlas-heading">
      <div>
        <div class="atlas-eyebrow">THE HANOK COURTYARD · {{ activeLevel }}</div>
        <div class="atlas-title">走进韩语的一砖一瓦</div>
      </div>
      <div class="atlas-stops"><b>06</b><span>STOPS</span></div>
    </div>
    <div ref="canvasEl" class="atlas-canvas"></div>
    <div v-if="failed" class="atlas-fallback">
      <img src="/images/study-still-life.webp" alt="纸雕韩屋与学习静物" />
      <span>当前设备使用静态庭院，课程仍可在下方列表中浏览。</span>
    </div>
    <div class="atlas-legend">
      <span><i></i>{{ activeLevel }} 学习路线</span>
      <small>拖动环视 · 双指缩放 · 点选课程</small>
    </div>
  </section>
</template>

<style scoped>
.atlas {
  position: relative;
  margin: 0;
  padding: 18px 0 12px;
  border-top: 1px solid #283b3b;
  border-bottom: 1px solid #d4d2c9;
  overflow: hidden;
  color: #253b3b;
  background: #efede6;
}
.atlas-heading, .atlas-legend { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; padding: 0 4px; }
.atlas-eyebrow { color: #6c7972; font-size: 9px; font-weight: 750; letter-spacing: .16em; }
.atlas-title { margin-top: 4px; font-family: var(--font-display); font-size: 23px; font-weight: 600; letter-spacing: -.045em; }
.atlas-stops { display: flex; align-items: baseline; gap: 5px; color: #315658; }
.atlas-stops b { font-family: var(--font-display); font-size: 30px; font-weight: 500; }
.atlas-stops span { font-size: 8px; letter-spacing: .13em; }
.atlas-canvas { position: relative; height: 292px; margin: 0 -8px; cursor: grab; touch-action: pan-y; }
.atlas-canvas:active { cursor: grabbing; }
.atlas-canvas :deep(canvas) { display: block; width: 100%; height: 100%; outline: none; }
.atlas-legend { justify-content: flex-start; gap: 12px; color: #526360; font-size: 10px; font-weight: 650; }
.atlas-legend span { display: inline-flex; align-items: center; gap: 6px; }
.atlas-legend i { width: 7px; height: 7px; background: #dfff69; border: 1px solid #6b7b43; border-radius: 50%; }
.atlas-legend small { margin-left: auto; color: #7d847e; font-size: 9px; font-weight: 500; }
.atlas-fallback { position: absolute; inset: 75px 0 40px; display: grid; place-items: center; background: #efede6; }
.atlas-fallback img { width: 100%; height: 100%; object-fit: cover; opacity: .45; }
.atlas-fallback span { position: absolute; bottom: 14px; left: 20px; right: 20px; padding: 8px; background: rgba(239,237,230,.9); color: #526360; font-size: 11px; text-align: center; }
@media (min-width: 760px) { .atlas-canvas { height: 420px; } .atlas-title { font-size: 30px; } }
@media (max-width: 360px) { .atlas-canvas { height: 254px; } .atlas-legend small { font-size: 8px; } }
</style>