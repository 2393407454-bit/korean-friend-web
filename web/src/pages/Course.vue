<script setup>
// 课程页：3D 单元星图 + A1/A2/B1 分级解锁 + 单元详情（3 节课 × 四类练习）
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import CourseMap3D from '../components/CourseMap3D.vue';
import { loadCourse, courseState } from '../api/course';
import {
  LEVELS,
  MODE_META,
  firstUnfinishedLesson,
  levelInfo,
  levelProgress,
  levelUnlockInfo,
  lessonCompletion,
  unitCompletion,
  unitsOfLevel
} from '../data/korean-course';

const router = useRouter();

const ui = reactive({
  activeLevel: 'A1',
  selectedUnitId: ''
});

const loading = ref(!courseState.loaded);

const course = computed(() => courseState.course);
const progress = computed(() => course.value.progress || {});
const xpInfo = computed(() => levelInfo(course.value.xp));
const activeLevel = computed(() => LEVELS.find((l) => l.id === ui.activeLevel) || LEVELS[0]);
const activeUnlock = computed(() => levelUnlockInfo(progress.value, LEVELS.findIndex((l) => l.id === ui.activeLevel)));
const activeUnits = computed(() => unitsOfLevel(ui.activeLevel));

const continueTarget = computed(() => {
  if (!activeUnlock.value.unlocked) return null;
  return firstUnfinishedLesson(progress.value, ui.activeLevel);
});

const prevLevel = computed(() => {
  const i = LEVELS.findIndex((l) => l.id === ui.activeLevel);
  return i > 0 ? LEVELS[i - 1] : null;
});

function levelPct(level) {
  return levelProgress(progress.value, level);
}

function unlockOf(level) {
  return levelUnlockInfo(progress.value, LEVELS.findIndex((l) => l.id === level.id));
}

function unitPct(unit) {
  return unitCompletion(progress.value, unit);
}

function lessonPct(unit, lesson) {
  return lessonCompletion(progress.value, unit, lesson);
}

function modeState(unit, lesson, mode) {
  const up = progress.value[unit.id] || {};
  const lp = up[lesson.id] || {};
  return lp[mode] || null;
}

function onSelectLevel(levelId) {
  ui.activeLevel = levelId;
  ui.selectedUnitId = '';
}

function onSelectUnit(unitId) {
  const unit = unitsOfLevel(ui.activeLevel).find((u) => u.id === unitId);
  if (!unit) {
    // 点到其他级别的节点：先切到对应级别
    const found = LEVELS.find((l) => l.units.some((u) => u.id === unitId));
    if (!found) return;
    const info = levelUnlockInfo(progress.value, LEVELS.findIndex((l) => l.id === found.id));
    if (!info.unlocked) return;
    ui.activeLevel = found.id;
    ui.selectedUnitId = unitId;
    return;
  }
  if (!activeUnlock.value.unlocked) return;
  ui.selectedUnitId = unitId;
}

// 叠放：点击单元头展开/收起课时详情
function toggleUnit(unit) {
  if (!activeUnlock.value.unlocked) return;
  ui.selectedUnitId = ui.selectedUnitId === unit.id ? '' : unit.id;
}

function goPractice(unit, lesson, mode) {
  router.push(`/practice/${unit.id}/${lesson.id}/${mode}`);
}

function startContinue() {
  const target = continueTarget.value;
  if (!target) return;
  goPractice(target.unit, target.lesson, target.mode);
}

function goProgress() {
  router.push('/progress');
}

function bestOf(unit, lesson, mode) {
  const st = modeState(unit, lesson, mode);
  return st && st.completed ? (st.best != null ? st.best : st.score) : null;
}

onMounted(() => {
  loadCourse().then(() => {
    loading.value = false;
    // 已有进度时直接落在最近推进的级别
    if (progress.value && Object.keys(progress.value).length) {
      const a2 = levelUnlockInfo(progress.value, 1);
      const b1 = levelUnlockInfo(progress.value, 2);
      if (b1.unlocked) ui.activeLevel = 'B1';
      else if (a2.unlocked) ui.activeLevel = 'A2';
    }
  });
});
</script>

<template>
  <div class="page">
    <!-- 顶部 -->
    <header class="hero rise rise-1">
      <div class="hero-left">
        <div class="h-page">课程</div>
        <div class="hero-sub">한국어 · A1 / A2 / B1 · 18 单元 54 课</div>
      </div>
      <div class="hero-right">
        <button class="xp-pill" @click="goProgress">
          <span class="xp-lv">LV.{{ xpInfo.level }}</span>
          <span class="xp-num num">{{ course.xp }} XP</span>
        </button>
        <button class="streak-pill" @click="goProgress">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3.5 4 5 4 8a4 4 0 0 1-8 0c0-1.2.4-2 1-3.2.6 1.2 1.4 1.7 1.4 1.7S10 7 12 3Z" /><path d="M7 17a5 5 0 0 0 10 0" /></svg>
          <span class="num">{{ course.streak }}</span> 天
        </button>
      </div>
    </header>

    <!-- 3D Seoul route map -->
    <CourseMap3D
      v-if="!loading"
      class="rise rise-2"
      :progress="progress"
      :active-level="ui.activeLevel"
      :selected-unit="ui.selectedUnitId"
      @select-level="onSelectLevel"
      @select-unit="onSelectUnit"
    />
    <div v-else class="map-skeleton card rise rise-2">
      <div class="sk-line sk-line-lg"></div>
      <div class="sk-line"></div>
    </div>

    <!-- 级别切换 -->
    <div class="level-row rise rise-2">
      <button
        v-for="level in LEVELS"
        :key="level.id"
        class="level-tab"
        :class="{ 'is-active': ui.activeLevel === level.id, 'is-locked': !unlockOf(level).unlocked }"
        @click="onSelectLevel(level.id)"
      >
        <span class="lt-top">
          <span class="lt-id">{{ level.id }}</span>
          <svg v-if="!unlockOf(level).unlocked" class="lt-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        </span>
        <span class="lt-title">{{ level.title }}</span>
        <span class="lt-pct num">{{ levelPct(level) }}%</span>
      </button>
    </div>

    <!-- 继续学习 -->
    <section v-if="!loading" class="continue-card rise rise-3">
      <div class="cc-copy">
        <div class="cc-kicker">{{ activeUnlock.unlocked ? 'CONTINUE' : 'LOCKED' }}</div>
        <div v-if="activeUnlock.unlocked && continueTarget" class="cc-title">
          {{ continueTarget.unit.zh }} · {{ continueTarget.lesson.title }}
        </div>
        <div v-else-if="activeUnlock.unlocked" class="cc-title">本级课程已全部完成</div>
        <div v-else class="cc-title">完成上一级 {{ activeUnlock.need }} 个单元（≥50%）后解锁</div>
        <div class="cap">
          {{ activeUnlock.unlocked
            ? (continueTarget ? '下一项：' + MODE_META[continueTarget.mode].label : '可以进入下一级别或复习已学单元')
            : '当前已达成 ' + activeUnlock.done + ' / ' + activeUnlock.need + ' 个单元' }}
        </div>
      </div>
      <button
        v-if="activeUnlock.unlocked && continueTarget"
        class="cc-btn"
        @click="startContinue"
      >
        继续
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
      <button v-else-if="activeUnlock.unlocked" class="cc-btn" @click="goProgress">看进度</button>
    </section>

    <!-- 单元列表 -->
    <section class="unit-head rise rise-3">
      <div>
        <div class="uh-kicker">{{ activeLevel.id }} · UNIT MAP</div>
        <h2 class="uh-title">{{ activeLevel.title }} · {{ activeUnits.length }} 个单元</h2>
      </div>
      <span class="uh-tag">{{ activeLevel.desc }}</span>
    </section>

    <div v-if="!activeUnlock.unlocked" class="locked-block rise rise-3">
      <div class="lb-title">本级别尚未解锁</div>
      <div class="cap">需要上一级至少 {{ activeUnlock.need }} 个单元达到 50% 进度（当前 {{ activeUnlock.done }} 个）。</div>
      <button v-if="prevLevel" class="btn btn-primary btn-pill lb-btn" @click="onSelectLevel(prevLevel.id)">回到 {{ prevLevel.id }} · {{ prevLevel.title }}</button>
    </div>

    <div v-else class="unit-stack">
      <div
        v-for="(unit, i) in activeUnits"
        :key="unit.id"
        class="unit-item"
        :style="{ '--i': i }"
        :class="{ 'is-open': ui.selectedUnitId === unit.id }"
      >
        <button
          class="unit-toggle"
          type="button"
          :aria-expanded="ui.selectedUnitId === unit.id"
          @click="toggleUnit(unit)"
        >
          <span class="ut-index num">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="ut-names">
            <span class="ut-zh">{{ unit.zh }}</span>
            <span class="ut-ko">{{ unit.title }}</span>
          </span>
          <span class="ut-pct num" :class="{ 'is-started': unitPct(unit) > 0 }">{{ unitPct(unit) }}%</span>
          <svg class="ut-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div class="unit-body" :aria-hidden="ui.selectedUnitId !== unit.id">
          <div class="unit-inner">
            <div class="ut-wrap">
              <p class="ut-blurb">{{ unit.blurb }}</p>
              <div class="ut-bar-row">
                <div class="bar-track"><div class="bar-fill" :style="{ width: unitPct(unit) + '%' }"></div></div>
                <span class="ut-cap">3 节课 · 8 项练习</span>
              </div>
              <div class="ut-lessons">
                <div v-for="lesson in unit.lessons" :key="lesson.id" class="ut-lesson">
                  <div class="utl-top">
                    <span class="utl-title">{{ lesson.title }}</span>
                    <span class="utl-note">{{ lesson.note }}</span>
                    <span class="utl-pct num">{{ lessonPct(unit, lesson).done }}/{{ lessonPct(unit, lesson).total }}</span>
                  </div>
                  <div class="utl-modes">
                    <button
                      v-for="mode in lesson.modes"
                      :key="mode"
                      class="utl-mode"
                      @click="goPractice(unit, lesson, mode)"
                    >
                      <span class="utlm-label">{{ MODE_META[mode].label }}</span>
                      <span v-if="bestOf(unit, lesson, mode) != null" class="utlm-score num">{{ bestOf(unit, lesson, mode) }} 分</span>
                      <span v-else class="utlm-score is-new">开始</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="ut-foot cap">完成一节课的全部练习后，该课时计入单元进度</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button class="progress-entry rise rise-4" @click="goProgress">
      <span class="pe-copy">
        <span class="pe-t1">学习进度</span>
        <span class="pe-t2">四能力雷达 · 12 周热力图 · XP 与等级</span>
      </span>
      <span class="pe-arrow">→</span>
    </button>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  max-width: 940px;
  margin: 0 auto;
  padding: 24px 16px calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 28px);
  min-height: 100dvh;
}

/* 顶部 */
.hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin: 0 16px 14px; }
.hero-left { min-width: 0; }
.hero-sub { margin-top: 5px; font-size: 11px; color: var(--ink-3); }
.hero-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.xp-pill {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: 11px; font-weight: 700;
}
.xp-lv { font-weight: 800; }
.xp-num { font-size: 11px; }
.streak-pill {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--ink-2);
}
.streak-pill svg { width: 13px; height: 13px; color: #C4732C; }
.map-skeleton { height: 300px; }

/* 级别切换 */
.level-row { display: flex; gap: 8px; margin: 14px 14px 0; }
.level-tab {
  flex: 1;
  padding: 9px 10px 8px;
  border-radius: var(--radius-m);
  border: 1px solid var(--line);
  background: var(--surface);
  text-align: left;
  display: flex; flex-direction: column; gap: 1px;
  transition: all .18s ease;
}
.level-tab.is-active {
  border-color: var(--ink);
  background: var(--ink);
  color: #fff;
}
.level-tab.is-locked { color: var(--ink-3); }
.lt-top { display: flex; align-items: center; justify-content: space-between; }
.lt-id { font-size: 13px; font-weight: 800; letter-spacing: .02em; }
.lt-lock { width: 11px; height: 11px; }
.lt-title { font-size: 10px; opacity: .7; }
.lt-pct { font-size: 10px; opacity: .8; }

/* 继续学习 */
.continue-card {
  display: flex; align-items: center; gap: 12px;
  margin: 14px 14px 0;
  padding: 14px 16px;
  border-radius: var(--radius-l);
  background: var(--ink);
  color: #fff;
  box-shadow: 0 10px 24px rgba(20, 21, 25, 0.18);
}
.cc-copy { flex: 1; min-width: 0; }
.cc-kicker { font-size: 9px; letter-spacing: .14em; color: rgba(255, 255, 255, 0.66); font-weight: 700; }
.cc-title { margin-top: 3px; font-size: 15px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.continue-card .cap { color: rgba(255, 255, 255, 0.78); margin-top: 2px; }
.cc-btn {
  flex: none;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 9px 14px;
  border-radius: var(--radius-pill);
  background: #fff;
  color: var(--ink);
  font-size: 12px; font-weight: 700;
}
.cc-btn svg { width: 13px; height: 13px; }

/* 液态悬停：与全局 btn-pill 同语言 */
.cc-btn {
  transition:
    border-radius .5s cubic-bezier(.22, 1, .36, 1),
    transform .3s cubic-bezier(.22, .61, .36, 1),
    box-shadow .35s ease;
}
@media (hover: hover) {
  .cc-btn:hover {
    animation: cc-liquid 2.6s ease-in-out infinite;
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, .3);
  }
}
@keyframes cc-liquid {
  0%, 100% { border-radius: 56% 44% 52% 48% / 46% 58% 42% 54%; }
  33% { border-radius: 44% 56% 46% 54% / 56% 44% 56% 44%; }
  66% { border-radius: 50% 50% 44% 56% / 44% 52% 48% 56%; }
}
@media (prefers-reduced-motion: reduce) {
  .cc-btn, .cc-btn:hover { animation: none; transition: none; }
}

/* 单元列表标题 */
.unit-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 22px 16px 10px; }
.uh-kicker { font-size: 9px; font-weight: 800; letter-spacing: .12em; color: var(--ink-3); }
.uh-title { margin-top: 2px; font-size: 16px; font-weight: 800; }
.uh-tag { font-size: 10px; color: var(--ink-3); text-align: right; max-width: 55%; line-height: 1.4; }

/* 单元叠放列表 */
.unit-stack { display: flex; flex-direction: column; margin: 0 14px; border-top: 1px solid var(--line); }
.unit-item { border-bottom: 1px solid var(--line); }
.unit-toggle {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 14px 2px;
  background: none;
  text-align: left;
}
.ut-index { flex: none; font-size: 11px; font-weight: 800; color: var(--ink-3); }
.ut-names { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.ut-zh { font-size: 15px; font-weight: 800; }
.ut-ko { font-size: 11px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ut-pct { flex: none; font-size: 12px; font-weight: 700; color: var(--ink-3); }
.ut-pct.is-started { color: var(--accent-deep); }
.ut-chev { width: 14px; height: 14px; flex: none; color: var(--ink-3); transition: transform .3s cubic-bezier(.22,.61,.36,1); }
.unit-item.is-open .ut-chev { transform: rotate(180deg); }
.unit-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .32s cubic-bezier(.22,.61,.36,1); }
.unit-item.is-open .unit-body { grid-template-rows: 1fr; }
.unit-inner { overflow: hidden; min-height: 0; }
.ut-wrap { margin: 0 2px 14px; padding: 12px 13px 13px; border-radius: var(--radius-m); background: var(--surface-2); }
.ut-blurb { margin: 0; font-size: 11px; color: var(--ink-2); line-height: 1.55; }
.ut-bar-row { display: flex; align-items: center; gap: 10px; margin: 10px 0 12px; }
.bar-track { flex: 1; height: 5px; border-radius: 999px; background: var(--line); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width .4s cubic-bezier(.22,.61,.36,1); }
.ut-cap { flex: none; font-size: 10px; color: var(--ink-3); }
.ut-lesson { border-top: 1px solid var(--line); padding-top: 10px; }
.ut-lesson + .ut-lesson { margin-top: 10px; }
.utl-top { display: flex; align-items: baseline; gap: 8px; }
.utl-title { font-size: 12px; font-weight: 700; }
.utl-note { flex: 1; font-size: 9px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.utl-pct { font-size: 9px; color: var(--ink-3); }
.utl-modes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
.utl-mode {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 11px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line-2);
  background: var(--surface);
  font-size: 12px;
  transition: all .16s ease;
}
.utl-mode:active { transform: scale(0.96); }
.utlm-label { font-weight: 600; }
.utlm-score { font-size: 10px; color: var(--accent-deep); font-weight: 700; }
.utlm-score.is-new { color: var(--ink-3); font-weight: 500; }
.ut-foot { margin-top: 12px; text-align: center; }

/* 叠放抽卡动效：行错落入场；展开时托盘如抽卡升起，课时与胶囊逐个就位 */
.unit-item { animation: row-in .4s cubic-bezier(.22, .61, .36, 1) both; animation-delay: calc(var(--i, 0) * 55ms); }
@keyframes row-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.unit-item:not(.is-open) .unit-body { transition-duration: .22s; }
.unit-item.is-open .ut-wrap { animation: tray-in .42s cubic-bezier(.22, .61, .36, 1); }
@keyframes tray-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.unit-item.is-open .ut-lesson { animation: row-in .34s ease both; }
.unit-item.is-open .ut-lesson:nth-child(1) { animation-delay: .08s; }
.unit-item.is-open .ut-lesson:nth-child(2) { animation-delay: .14s; }
.unit-item.is-open .ut-lesson:nth-child(3) { animation-delay: .2s; }
.unit-item.is-open .utl-mode { animation: pill-in .26s ease both; }
@keyframes pill-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.unit-item.is-open .utl-mode:nth-child(1) { animation-delay: .16s; }
.unit-item.is-open .utl-mode:nth-child(2) { animation-delay: .2s; }
.unit-item.is-open .utl-mode:nth-child(3) { animation-delay: .24s; }
.unit-item.is-open .utl-mode:nth-child(4) { animation-delay: .28s; }
@media (prefers-reduced-motion: reduce) {
  .unit-item, .unit-item.is-open .ut-wrap, .unit-item.is-open .ut-lesson, .unit-item.is-open .utl-mode { animation: none; }
}

.locked-block {
  margin: 0 14px;
  padding: 22px 18px;
  border-radius: var(--radius-l);
  border: 1px dashed var(--line-2);
  background: var(--surface-2);
  text-align: center;
}
.lb-title { font-size: 15px; font-weight: 800; margin-bottom: 4px; }
.lb-btn { margin-top: 14px; }

/* 进度入口 */
.progress-entry {
  display: flex; align-items: center; gap: 10px;
  width: calc(100% - 28px);
  margin: 16px 14px 0;
  padding: 13px 16px;
  border-radius: var(--radius-l);
  border: 1px dashed var(--line-2);
  background: transparent;
  text-align: left;
}
.pe-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.pe-t1 { font-size: 13px; font-weight: 700; }
.pe-t2 { font-size: 11px; color: var(--ink-3); }
.pe-arrow { color: var(--ink-3); }

@media (min-width: 760px) {
  .page { padding: 42px 32px 120px; }
  .hero { margin: 0 0 28px; align-items: flex-end; }
  .hero .h-page { font-family: var(--font-display); font-size: 44px; font-weight: 600; letter-spacing: -.06em; }
  .hero-right { flex-direction: row; align-items: center; }
  .level-row, .continue-card { margin-left: 0; margin-right: 0; }
  .level-row { margin-top: 20px; }
  .level-tab { min-height: 74px; padding: 13px 16px; border-radius: 0; }
  .continue-card { border-radius: 0; padding: 20px 24px; }
  .unit-head { margin-left: 0; margin-right: 0; }
  .unit-stack { margin: 0; }
  .ut-wrap { padding: 14px 16px 16px; }
  .progress-entry { width: 100%; margin-left: 0; margin-right: 0; }
}
</style>
