<script setup>
import { onBeforeUnmount, ref } from 'vue';

const emit = defineEmits(['open']);
const scene = ref(null);
const dragging = ref(false);
let lastX = 0;
let lastY = 0;
let rx = 0;
let ry = 0;
let frame = 0;

function paint() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!scene.value) return;
    scene.value.style.setProperty('--cover-rx', `${rx.toFixed(2)}deg`);
    scene.value.style.setProperty('--cover-ry', `${ry.toFixed(2)}deg`);
  });
}

function tilt(event) {
  const rect = scene.value?.getBoundingClientRect();
  if (!rect) return;
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  ry = Math.max(-9, Math.min(9, x * 14));
  rx = Math.max(-7, Math.min(7, y * -10));
  paint();
}

function onDown(event) {
  if (event.target.closest('button')) return;
  dragging.value = true;
  lastX = event.clientX;
  lastY = event.clientY;
  scene.value?.setPointerCapture(event.pointerId);
}

function onMove(event) {
  if (dragging.value) {
    ry = Math.max(-10, Math.min(10, ry + (event.clientX - lastX) * 0.09));
    rx = Math.max(-8, Math.min(8, rx - (event.clientY - lastY) * 0.08));
    lastX = event.clientX;
    lastY = event.clientY;
    paint();
  } else if (event.pointerType !== 'touch') {
    tilt(event);
  }
}

function reset() {
  dragging.value = false;
  rx = 0;
  ry = 0;
  paint();
}

function onKey(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Home') { rx = 0; ry = 0; }
  if (event.key === 'ArrowLeft') ry = Math.max(-10, ry - 2);
  if (event.key === 'ArrowRight') ry = Math.min(10, ry + 2);
  if (event.key === 'ArrowUp') rx = Math.min(8, rx + 2);
  if (event.key === 'ArrowDown') rx = Math.max(-8, rx - 2);
  paint();
}

onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <section class="cover-feature" aria-labelledby="cover-title">
    <div class="cover-meta">
      <span>THE SPEAKING ISSUE</span>
      <span>VOL. 01 · SEOUL</span>
    </div>
    <div
      ref="scene"
      class="cover-scene"
      :class="{ 'is-dragging': dragging }"
      tabindex="0"
      role="img"
      aria-label="立体学习海报：纸雕韩屋、笔记本与首尔地图。拖动或使用方向键调整视角，Home 键复位。"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="reset"
      @pointercancel="reset"
      @pointerleave="!dragging && reset()"
      @keydown="onKey"
    >
      <div class="cover-object">
        <img class="cover-photo" src="/images/study-still-life.webp" alt="" draggable="false" fetchpriority="high" />
        <div class="cover-shade" aria-hidden="true"></div>
        <div class="cover-copy">
          <span class="cover-kicker">오늘의 한국어 · DAILY KOREAN</span>
          <h2 id="cover-title">把每一次开口，<br />装订成进步。</h2>
          <p>从一句안녕하세요，到真实表达。</p>
        </div>
        <span class="cover-number" aria-hidden="true">01</span>
        <button class="cover-action" type="button" @click.stop="emit('open')">
          翻开课程 <span aria-hidden="true">↗</span>
        </button>
        <span class="cover-spine" aria-hidden="true"></span>
      </div>
    </div>
    <div class="cover-caption">
      <span>纸雕韩屋 × 学习静物 · 原创视觉</span>
      <span>拖动立体海报</span>
    </div>
  </section>
</template>

<style scoped>
.cover-feature { margin: 0 0 24px; }
.cover-meta, .cover-caption {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: var(--ink-2);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: .14em;
}
.cover-meta { padding: 0 2px 10px; border-bottom: 1px solid var(--ink); }
.cover-caption { padding: 10px 2px 0; color: var(--ink-3); font-size: 9px; letter-spacing: .05em; }
.cover-scene {
  --cover-rx: 0deg;
  --cover-ry: 0deg;
  position: relative;
  height: 300px;
  margin-top: 14px;
  perspective: 1100px;
  cursor: grab;
  touch-action: pan-y;
  outline: none;
}
.cover-scene.is-dragging { cursor: grabbing; touch-action: none; }
.cover-scene:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; }
.cover-object {
  position: absolute;
  inset: 0 7px;
  overflow: hidden;
  background: #d6cdbd;
  box-shadow: 0 22px 38px rgba(44, 42, 35, .18), 7px 8px 0 #d4cec1;
  transform: rotateX(var(--cover-rx)) rotateY(var(--cover-ry));
  transform-style: preserve-3d;
  transition: transform .55s cubic-bezier(.16, 1, .3, 1), box-shadow .55s cubic-bezier(.16, 1, .3, 1);
  will-change: transform;
}
.is-dragging .cover-object { transition: box-shadow .2s ease; box-shadow: 0 30px 48px rgba(44, 42, 35, .23), 10px 10px 0 #c9c1b1; }
.cover-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 54%; user-select: none; transform: scale(1.035) translateZ(-12px); }
.cover-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(20, 25, 24, .74) 0%, rgba(20, 25, 24, .32) 48%, transparent 76%); transform: translateZ(5px); }
.cover-copy { position: absolute; left: 24px; top: 28px; color: #f7f5ee; transform: translateZ(30px); }
.cover-kicker { font-size: 9px; font-weight: 650; letter-spacing: .13em; }
.cover-copy h2 { margin: 14px 0 10px; font-family: var(--font-display); font-size: clamp(29px, 7vw, 43px); font-weight: 600; line-height: 1.24; letter-spacing: -.07em; }
.cover-copy p { margin: 0; color: rgba(247, 245, 238, .82); font-size: 12px; }
.cover-number { position: absolute; top: 20px; right: 21px; color: rgba(255,255,255,.82); font-family: var(--font-display); font-size: 38px; line-height: 1; transform: translateZ(24px); }
.cover-action {
  position: absolute;
  left: 24px;
  bottom: 25px;
  min-height: 44px;
  padding: 0 17px;
  display: inline-flex;
  align-items: center;
  gap: 24px;
  border: 1px solid rgba(255,255,255,.65);
  background: rgba(247,245,238,.94);
  color: #1d2928;
  font-size: 12px;
  font-weight: 700;
  transform: translateZ(36px);
  transition: background .2s ease, color .2s ease;
}
.cover-action:hover { background: #dfff69; color: #182016; }
.cover-action:focus-visible { outline: 2px solid #dfff69; outline-offset: 3px; }
.cover-spine { position: absolute; inset: 0 auto 0 0; width: 7px; background: #1f3434; transform: translateZ(12px); }
@media (min-width: 760px) {
  .cover-feature { margin-bottom: 36px; }
  .cover-scene { height: 410px; }
  .cover-copy { left: 40px; top: 43px; }
  .cover-copy h2 { font-size: 52px; }
  .cover-copy p { font-size: 14px; }
  .cover-action { left: 40px; bottom: 38px; }
  .cover-number { right: 36px; top: 32px; font-size: 54px; }
}
@media (prefers-reduced-motion: reduce) {
  .cover-scene { touch-action: pan-y; }
  .cover-object, .cover-action { transition: none; transform: none; }
}
</style>