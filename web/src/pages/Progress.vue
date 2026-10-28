<script setup>
// 学习进度：3D 等级奖章 + 四能力平均分雷达 + 12 周热力图 + 连续天数 / XP / 单元完成度
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import ProgressOrb3D from '../components/ProgressOrb3D.vue';
import { loadCourse, courseState } from '../api/course';
import {
  LEVELS,
  MODE_META,
  MODES,
  levelInfo,
  levelProgress,
  unitCompletion
} from '../data/korean-course';

const router = useRouter();

const course = computed(() => courseState.course);
const progress = computed(() => course.progress || {});
const activity = computed(() => course.value.activity || {});
const xpInfo = computed(() => levelInfo(course.value.xp));

const skillRows = computed(() => {
  const acc = { vocab: [], grammar: [], speaking: [], listening: [] };
  Object.values(progress.value).forEach((unitProg) => {
    Object.values(unitProg || {}).forEach((lessonProg) => {
      MODES.forEach((mode) => {
        const st = lessonProg && lessonProg[mode];
        if (st && st.completed) acc[mode].push(st.best != null ? st.best : (st.score || 0));
      });
    });
  });
  return MODES.map((mode) => ({
    mode,
    label: MODE_META[mode].label,
    score: acc[mode].length ? Math.round(acc[mode].reduce((a, b) => a + b, 0) / acc[mode].length) : 0,
    count: acc[mode].length
  }));
});

const hasSkills = computed(() => skillRows.value.some((r) => r.score > 0));
const weakSkill = computed(() => skillRows.value.slice().sort((a, b) => a.score - b.score)[0]);

const totalMinutes = computed(() => Object.values(activity.value).reduce((a, b) => a + (Number(b) || 0), 0));
const activeDays = computed(() => Object.values(activity.value).filter((m) => Number(m) > 0).length);

const masteredWords = computed(() => {
  let n = 0;
  LEVELS.forEach((level) => level.units.forEach((unit) => {
    const up = progress.value[unit.id] || {};
    const done = Object.keys(up).some((lid) => up[lid] && up[lid].vocab && up[lid].vocab.completed);
    if (done) n += unit.vocab.length;
  }));
  return n;
});

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const heatWeeks = computed(() => {
  const days = [];
  for (let i = 83; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    days.push({ key, mins: Number(activity.value[key]) || 0 });
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
});

function heatLevel(m) {
  if (!m) return 0;
  if (m < 10) return 1;
  if (m < 20) return 2;
  if (m < 35) return 3;
  return 4;
}

const radar = computed(() => {
  const values = skillRows.value.map((r) => r.score);
  const cx = 100;
  const cy = 104;
  const R = 66;
  const points = values.map((v, i) => {
    const ang = -Math.PI / 2 + (i * Math.PI) / 2;
    const r = 10 + (Math.max(0, Math.min(100, v)) / 100) * (R - 10);
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
  });
  const rings = [0.25, 0.5, 0.75, 1].map((ratio) => {
    return [0, 1, 2, 3].map((i) => {
      const ang = -Math.PI / 2 + (i * Math.PI) / 2;
      return `${(cx + Math.cos(ang) * R * ratio).toFixed(1)},${(cy + Math.sin(ang) * R * ratio).toFixed(1)}`;
    }).join(' ');
  });
  const axes = [0, 1, 2, 3].map((i) => {
    const ang = -Math.PI / 2 + (i * Math.PI) / 2;
    return { x2: (cx + Math.cos(ang) * R).toFixed(1), y2: (cy + Math.sin(ang) * R).toFixed(1) };
  });
  const labelPos = [[100, 20, 'middle'], [186, 108, 'end'], [100, 196, 'middle'], [14, 108, 'start']];
  return { cx, cy, points, rings, axes, labelPos };
});

function unitRows(level) {
  return level.units.map((unit) => ({
    id: unit.id,
    zh: unit.zh,
    ko: unit.title,
    pct: unitCompletion(progress.value, unit)
  }));
}

function goCourse() {
  router.push('/course');
}

onMounted(() => {
  loadCourse();
});
</script>

<template>
  <div class="page">
    <header class="phead rise rise-1">
      <button class="pback" aria-label="返回课程" @click="goCourse">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div class="phead-copy">
        <div class="h-page">学习进度</div>
        <div class="phead-sub">四项能力 · 单元完成度 · 学习节奏</div>
      </div>
      <span class="lv-chip">LV.{{ xpInfo.level }} · {{ xpInfo.title }}</span>
    </header>

    <!-- 3D 等级奖章 -->
    <section class="card orb-card rise rise-2">
      <div class="card-head">
        <span class="h-sec">等级奖章</span>
        <span class="tag tag-accent">{{ course.xp }} XP</span>
      </div>
      <ProgressOrb3D :xp="course.xp" :level="xpInfo.level" :title="xpInfo.title" :pct="xpInfo.pct" />
      <div class="xp-line">
        <div class="bar-track"><div class="bar-fill" :style="{ width: xpInfo.pct + '%' }"></div></div>
        <span class="num">{{ xpInfo.cur }} / {{ xpInfo.need }} XP</span>
      </div>
      <div class="cap orb-cap">距离 LV.{{ xpInfo.level + 1 }} 还需 {{ xpInfo.need - xpInfo.cur }} XP</div>
    </section>

    <!-- 关键数据 -->
    <div class="stat-grid rise rise-2">
      <div class="stat">
        <span class="stat-v num">{{ course.streak }}</span>
        <span class="stat-k">连续学习 · 天</span>
      </div>
      <div class="stat">
        <span class="stat-v num">{{ course.best_streak }}</span>
        <span class="stat-k">最长连续 · 天</span>
      </div>
      <div class="stat">
        <span class="stat-v num">{{ totalMinutes }}</span>
        <span class="stat-k">累计时长 · 分钟</span>
      </div>
      <div class="stat">
        <span class="stat-v num">{{ masteredWords }}</span>
        <span class="stat-k">已学词条</span>
      </div>
    </div>

    <!-- 四能力 -->
    <section class="card rise rise-3">
      <div class="card-head">
        <span class="h-sec">四项能力平均分</span>
        <span class="tag">{{ hasSkills ? '实时' : '待积累' }}</span>
      </div>
      <div class="radar-wrap">
        <svg class="radar" viewBox="0 0 200 210" aria-label="四项能力雷达图">
          <polygon v-for="(pts, i) in radar.rings" :key="'r' + i" class="grid-line" :points="pts" />
          <line v-for="(a, i) in radar.axes" :key="'a' + i" class="axis" :x1="radar.cx" :y1="radar.cy" :x2="a.x2" :y2="a.y2" />
          <polygon class="shape" :points="radar.points.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')" />
          <circle v-for="(p, i) in radar.points" :key="'d' + i" class="dot" :cx="p[0].toFixed(1)" :cy="p[1].toFixed(1)" r="2.6" />
          <text
            v-for="(r, i) in skillRows"
            :key="'t' + i"
            :x="radar.labelPos[i][0]"
            :y="radar.labelPos[i][1]"
            :text-anchor="radar.labelPos[i][2]"
          >{{ r.label }}</text>
        </svg>
        <div class="radar-legend">
          <div v-for="r in skillRows" :key="r.mode" class="rl-row">
            <span class="rl-k">{{ r.label }}</span>
            <span class="rl-v num">{{ r.score }}</span>
            <span class="rl-n">{{ r.count }} 次</span>
          </div>
        </div>
      </div>
      <div v-if="hasSkills" class="insight-line">
        下一步建议：把时间投向「{{ weakSkill.label }}」，当前平均 {{ weakSkill.score }} 分，是四项里最低的一项。
      </div>
      <div v-else class="insight-line is-empty">
        完成任意一次单词或听力练习后，这里会生成能力画像，并按最低分推荐重点模块。
      </div>
    </section>

    <!-- 12 周热力图 -->
    <section class="card rise rise-3">
      <div class="card-head">
        <span class="h-sec">学习热力 · 最近 12 周</span>
        <span class="tag">{{ activeDays }} 个学习日</span>
      </div>
      <div class="heat-grid">
        <div v-for="(week, i) in heatWeeks" :key="'w' + i" class="heat-week">
          <span
            v-for="d in week"
            :key="d.key"
            class="heat-cell"
            :class="'l' + heatLevel(d.mins)"
            :title="d.key + ' · ' + d.mins + ' 分钟'"
          ></span>
        </div>
      </div>
      <div class="heat-legend">
        <span class="hl-l">少</span>
        <span v-for="l in [0, 1, 2, 3, 4]" :key="'lg' + l" class="heat-cell" :class="'l' + l"></span>
        <span class="hl-l">多</span>
        <span class="hl-r">最近 12 周</span>
      </div>
    </section>

    <!-- 单元完成度 -->
    <section class="card rise rise-4">
      <div class="card-head">
        <span class="h-sec">单元完成度</span>
        <span class="tag">18 单元 · 54 课</span>
      </div>
      <div v-for="level in LEVELS" :key="level.id" class="level-block">
        <div class="lb-head">
          <span class="lb-id">{{ level.id }}</span>
          <span class="lb-title">{{ level.title }}</span>
          <span class="lb-pct num">{{ levelProgress(progress, level) }}%</span>
        </div>
        <div class="lb-list">
          <div v-for="u in unitRows(level)" :key="u.id" class="lb-row">
            <span class="lb-name">{{ u.zh }}<span class="lb-ko">{{ u.ko }}</span></span>
            <div class="bar-track lb-bar"><div class="bar-fill" :style="{ width: u.pct + '%' }"></div></div>
            <span class="lb-num num">{{ u.pct }}%</span>
          </div>
        </div>
      </div>
    </section>

    <button class="back-course rise rise-4" @click="goCourse">回到课程 · 继续学习 →</button>
  </div>
</template>

<style scoped>
.page { padding: 18px 14px calc(env(safe-area-inset-bottom) + 40px); min-height: 100dvh; }

.phead { display: flex; align-items: center; gap: 10px; margin: 0 2px 14px; }
.pback {
  width: 38px; height: 38px; flex: none;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-2);
}
.pback svg { width: 18px; height: 18px; }
.phead-copy { flex: 1; min-width: 0; }
.phead-sub { margin-top: 4px; font-size: 11px; color: var(--ink-3); }
.lv-chip {
  flex: none;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: 10px; font-weight: 700;
}

.orb-card .card-head { margin-bottom: 6px; }
.xp-line { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 11px; color: var(--ink-2); }
.xp-line .bar-track { flex: 1; }
.orb-cap { margin-top: 4px; }

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
.stat {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 2px;
  box-shadow: var(--shadow-card);
}
.stat-v { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
.stat-k { font-size: 10px; color: var(--ink-3); }

.bar-track { height: 5px; border-radius: 999px; background: var(--line); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width .45s cubic-bezier(.22,.61,.36,1); }

.radar-wrap { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.radar { width: 52%; max-width: 200px; flex: none; }
.radar .grid-line { fill: none; stroke: rgba(20, 21, 25, 0.08); stroke-width: 1; }
.radar .axis { stroke: rgba(20, 21, 25, 0.06); stroke-width: 1; }
.radar .shape { fill: rgba(11, 107, 232, 0.16); stroke: var(--accent); stroke-width: 1.8; }
.radar .dot { fill: var(--accent); }
.radar text { font-size: 9px; fill: var(--ink-3); font-weight: 600; }
.radar-legend { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.rl-row { display: flex; align-items: baseline; gap: 6px; font-size: 11px; }
.rl-k { flex: 1; color: var(--ink-2); }
.rl-v { font-weight: 800; font-size: 13px; }
.rl-n { font-size: 9px; color: var(--ink-3); width: 28px; text-align: right; }
.insight-line {
  margin-top: 12px;
  padding: 10px 12px;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  border-radius: 0 var(--radius-s) var(--radius-s) 0;
  font-size: 11px;
  color: var(--ink-2);
  line-height: 1.6;
}
.insight-line.is-empty { border-left-color: var(--line-2); background: var(--surface-2); color: var(--ink-3); }

.heat-grid { display: flex; gap: 4px; margin-top: 8px; overflow-x: auto; padding-bottom: 2px; }
.heat-week { display: flex; flex-direction: column; gap: 4px; flex: none; }
.heat-cell { width: 11px; height: 11px; border-radius: 3px; background: #EEEDE8; display: inline-block; }
.heat-cell.l1 { background: #CFE0FA; }
.heat-cell.l2 { background: #9EC5F5; }
.heat-cell.l3 { background: #5A9BEC; }
.heat-cell.l4 { background: #0B6BE8; }
.heat-legend { display: flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 9px; color: var(--ink-3); }
.heat-legend .heat-cell { width: 9px; height: 9px; }
.hl-l { margin: 0 2px; }
.hl-r { margin-left: auto; }

.level-block { margin-top: 14px; }
.level-block + .level-block { border-top: 1px solid var(--line); padding-top: 14px; }
.lb-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.lb-id { font-size: 12px; font-weight: 800; color: var(--accent-deep); }
.lb-title { font-size: 12px; font-weight: 700; }
.lb-pct { margin-left: auto; font-size: 11px; color: var(--ink-3); }
.lb-list { display: flex; flex-direction: column; gap: 7px; }
.lb-row { display: flex; align-items: center; gap: 8px; }
.lb-name { width: 46%; font-size: 11px; color: var(--ink-2); display: flex; gap: 5px; min-width: 0; }
.lb-ko { color: var(--ink-3); font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-bar { flex: 1; height: 4px; }
.lb-num { width: 30px; text-align: right; font-size: 10px; color: var(--ink-3); }

.back-course {
  display: block;
  width: calc(100% - 28px);
  margin: 14px 14px 0;
  padding: 13px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
</style>
