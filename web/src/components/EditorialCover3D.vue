<script setup>
import { onBeforeUnmount, ref } from 'vue';

const emit = defineEmits(['open']);
const scene = ref(null);
const dragging = ref(false);

/* 纸套入场：借鉴 Token Pass 的「卡套抽出」机制，演绎为杂志封面从牛皮纸套中升起。
   每个会话只播一次；prefers-reduced-motion 时直接跳过。 */
const INTRO_KEY = 'kfp_cover_intro_v1';
const introState = ref('done'); // armed（套住）| playing（抽出中）| done
let introTimer = 0;

try {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const played = sessionStorage.getItem(INTRO_KEY) === '1';
  if (!reduced && !played) introState.value = 'armed';
} catch (e) { /* 存储不可用则不播 */ }

if (introState.value === 'armed') {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    introState.value = 'playing';
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* 忽略 */ }
    introTimer = window.setTimeout(() => { introState.value = 'done'; }, 1350);
  }));
}

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

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  clearTimeout(introTimer);
});
</script>

<template>
  <section
    class="cover-feature"
    :class="{ 'is-intro': introState !== 'done', 'is-intro-playing': introState === 'playing' }"
    aria-labelledby="cover-title"
  >
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
      aria-label="立体学习海报：纸雕首尔插画，韩屋村与南山塔。拖动或使用方向键调整视角，Home 键复位。"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="reset"
      @pointercancel="reset"
      @pointerleave="!dragging && reset()"
      @keydown="onKey"
    >
      <div class="cover-object">
        <!-- 纸雕首尔插画 · 两层视差 -->
        <svg class="cover-art art-back" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="coverSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#F8F4EA" />
              <stop offset="1" stop-color="#EFE8D5" />
            </linearGradient>
          </defs>
          <rect width="800" height="600" fill="url(#coverSky)" />
          <circle cx="640" cy="210" r="60" fill="#D9A75C" opacity=".88" />
          <circle cx="640" cy="210" r="80" fill="none" stroke="#A9783D" stroke-opacity=".32" stroke-width="1.6" />
          <path d="M478 208q11-9 22 0M512 226q9-7 18 0M460 240q8-6 16 0" fill="none" stroke="#6B6A5E" stroke-width="2.4" stroke-linecap="round" opacity=".55" />
          <path d="M0 336L92 288l88 40 96-56 104 62 78-34 92 40 96-46 82 32 72-22v330H0Z" fill="#E7DDC5" />
        </svg>
        <svg class="cover-art art-mid" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g transform="translate(0,-40)">
          <!-- 南山塔 -->
          <path d="M0 386c60-26 118-40 168-30l60 12 44-10c40-8 80 2 118 22v220H0Z" fill="#D8CBAE" />
          <rect x="743.5" y="284" width="3" height="26" fill="#B7AA88" />
          <circle cx="745" cy="284" r="3" fill="#A9783D" />
          <ellipse cx="745" cy="312" rx="19" ry="8.5" fill="#A9783D" />
          <path d="M732 382l9-72h8l9 72Z" fill="#B7AA88" />
          <!-- 韩屋村：实心屋顶 -->
          <path d="M0 452c90-18 210-26 330-22s260 16 470 8v210H0Z" fill="#CDBFA0" />
          <rect x="297" y="366" width="6" height="16" rx="2" fill="#273029" />
          <path d="M206 456c3-30 16-52 40-64 18-8 34-11 54-11s36 3 54 11c24 12 37 34 40 64Z" fill="#273029" />
          <rect x="240" y="456" width="120" height="74" fill="#E2D7BC" />
          <rect x="287" y="492" width="26" height="38" fill="#273029" opacity=".85" />
          <rect x="256" y="470" width="20" height="16" fill="#273029" opacity=".5" />
          <rect x="324" y="470" width="20" height="16" fill="#273029" opacity=".5" />
          <path d="M440 470c2-28 14-48 34-58 16-7 28-9 46-9s30 2 46 9c20 10 32 30 34 58Z" fill="#273029" />
          <rect x="476" y="470" width="80" height="62" fill="#DECFAF" />
          <rect x="506" y="496" width="20" height="36" fill="#273029" opacity=".85" />
          <path d="M596 470c2-24 12-40 28-48 13-6 22-8 36-8s23 2 36 8c16 8 26 24 28 48Z" fill="#273029" />
          <rect x="628" y="470" width="72" height="58" fill="#DECFAF" />
          <rect x="654" y="494" width="18" height="34" fill="#273029" opacity=".85" />
          </g>
        </svg>
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
      <div v-if="introState !== 'done'" class="cover-sleeve" aria-hidden="true">
        <span class="cover-sleeve-label">한국어 친구 · VOL. 01</span>
      </div>
    </div>
    <div class="cover-caption">
      <span>纸雕首尔 · 韩屋村与南山塔 · 原创插画</span>
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

/* 纸套入场：海报像卡片从牛皮纸套里抽出（每会话一次） */
.cover-sleeve {
  position: absolute;
  inset: 0 7px;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 24px;
  background: var(--surface-2);
  border: 1px solid rgba(32, 39, 37, .16);
  box-shadow: 6px 7px 0 #d4cec1;
  -webkit-mask: radial-gradient(30px 22px at 50% 0, transparent 29px, #000 30px);
  mask: radial-gradient(30px 22px at 50% 0, transparent 29px, #000 30px);
}
.cover-sleeve-label { font-size: 9px; font-weight: 700; letter-spacing: .18em; color: var(--ink-3); }
.is-intro .cover-scene { transform: translateY(24px); }
.is-intro-playing .cover-scene { transform: translateY(0); transition: transform .75s cubic-bezier(.16, 1, .3, 1); }
.is-intro-playing .cover-sleeve { transform: translateY(32%); opacity: 0; transition: transform .62s cubic-bezier(.16, 1, .3, 1), opacity .4s ease .18s; }
.is-intro .cover-copy, .is-intro .cover-action, .is-intro .cover-number { opacity: 0; }
.is-intro-playing .cover-copy { animation: cover-fade .34s ease .5s both; }
.is-intro-playing .cover-number { animation: cover-fade .34s ease .58s both; }
.is-intro-playing .cover-action { animation: cover-fade .34s ease .66s both; }
@keyframes cover-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .cover-sleeve { display: none; }
  .is-intro .cover-scene { transform: none; }
  .is-intro .cover-copy, .is-intro .cover-action, .is-intro .cover-number { opacity: 1; }
}
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
  background: #F5F0E2;
  border: 1px solid rgba(32, 39, 37, .22);
  box-shadow: 0 22px 38px rgba(44, 42, 35, .18), 7px 8px 0 #d4cec1;
  transform: rotateX(var(--cover-rx)) rotateY(var(--cover-ry));
  transform-style: preserve-3d;
  transition: transform .55s cubic-bezier(.16, 1, .3, 1), box-shadow .55s cubic-bezier(.16, 1, .3, 1);
  will-change: transform;
}
.is-dragging .cover-object { transition: box-shadow .2s ease; box-shadow: 0 30px 48px rgba(44, 42, 35, .23), 10px 10px 0 #c9c1b1; }
.cover-art { position: absolute; inset: 0; width: 100%; height: 100%; display: block; user-select: none; }
.art-back { transform: translateZ(-18px); }
.art-mid { transform: translateZ(4px); }
.cover-copy { position: absolute; left: 24px; top: 28px; color: var(--ink); transform: translateZ(30px); }
.cover-kicker { font-size: 9px; font-weight: 650; letter-spacing: .13em; color: var(--accent-deep); }
.cover-copy h2 { margin: 14px 0 10px; font-family: var(--font-display); font-size: clamp(29px, 7vw, 43px); font-weight: 600; line-height: 1.24; letter-spacing: -.07em; }
.cover-copy p { margin: 0; color: var(--ink-2); font-size: 12px; }
.cover-number { position: absolute; top: 20px; right: 21px; color: rgba(32, 39, 37, .22); font-family: var(--font-display); font-size: 38px; line-height: 1; transform: translateZ(24px); }
.cover-action {
  position: absolute;
  left: 24px;
  bottom: 25px;
  min-height: 44px;
  padding: 0 17px;
  display: inline-flex;
  align-items: center;
  gap: 24px;
  border: 1px solid var(--accent-deep);
  background: var(--accent);
  color: #FCFBF7;
  font-size: 12px;
  font-weight: 700;
  transform: translateZ(36px);
  transition: background .2s ease, color .2s ease;
}
.cover-action:hover { background: var(--accent-deep); color: #FCFBF7; }
.cover-action:focus-visible { outline: 2px solid var(--accent-deep); outline-offset: 3px; }
/* 液态悬停：只液化形态与投影，不碰 transform 以保住 3D 深度 */
.cover-action { transition: border-radius .5s cubic-bezier(.22, 1, .36, 1), box-shadow .35s ease, background .2s ease, color .2s ease; }
@media (hover: hover) {
  .cover-action:hover {
    animation: cover-liquid 2.6s ease-in-out infinite;
    box-shadow: 0 12px 24px rgba(132, 92, 43, .32), 0 4px 10px rgba(32, 39, 37, .16);
  }
}
@keyframes cover-liquid {
  0%, 100% { border-radius: 56% 44% 52% 48% / 46% 58% 42% 54%; }
  33% { border-radius: 44% 56% 46% 54% / 56% 44% 56% 44%; }
  66% { border-radius: 50% 50% 44% 56% / 44% 52% 48% 56%; }
}
.cover-spine { position: absolute; inset: 0 auto 0 0; width: 7px; background: var(--ink); transform: translateZ(12px); }
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
  .cover-object { transition: none; transform: none; }
  .cover-action { transition: none; }
  .cover-action, .cover-action:hover { animation: none; }
}
</style>