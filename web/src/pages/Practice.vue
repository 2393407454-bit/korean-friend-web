<script setup>
// 课程练习播放器：单词 3D 闪卡 / 语法·听力选择题 / 口语跟读（示范音、实时波形、评分、回放）
// 数据全部落库到 /api/course/progress，练习结束即结算 XP 与连续天数
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FlashCard3D from '../components/FlashCard3D.vue';
import { speak } from '../api/tts';
import { loadCaps, getCaps } from '../api/caps';
import { uploadFile } from '../api/client';
import { loadCourse, submitProgress, courseState } from '../api/course';
import { MODE_META, unitById } from '../data/korean-course';
import { createRecorder } from '../utils/recorder';
import { showToast } from '../utils/ui';

const route = useRoute();
const router = useRouter();

const unit = unitById(String(route.params.unitId || ''));
const lesson = unit ? unit.lessons.find((l) => l.id === route.params.lessonId) : null;

if (!unit || !lesson) {
  router.replace('/course');
}

const initialMode = lesson && lesson.modes.includes(route.params.mode) ? route.params.mode : (lesson ? lesson.modes[0] : 'vocab');

const s = reactive({
  mode: initialMode,
  idx: 0,
  flipped: false,
  ratings: [],
  selected: null,
  checked: false,
  correct: 0,
  results: [],
  score: null,
  metrics: null,
  advice: '',
  source: '',
  recording: false,
  recordTime: 0,
  level: 0,
  wave: [],
  audioUrl: '',
  fallback: false,
  evaluating: false,
  done: false,
  summary: null,
  burst: 'idle' // 单词模式：idle 词包未拆 → bursting 爆开中 → spread 贴纸散开 → done 进入逐卡学习
});

// 贴纸散开的目标位（相对画面中心，px / 旋转 deg）
const CHIP_SPOTS = [
  { x: -104, y: -102, r: -7 },
  { x: 96, y: -114, r: 5 },
  { x: -118, y: -4, r: 6 },
  { x: 112, y: 6, r: -6 },
  { x: -88, y: 102, r: -5 },
  { x: 94, y: 110, r: 7 }
];

const loading = ref(!courseState.loaded);
let recorder = null;

const items = computed(() => {
  if (!unit) return [];
  if (s.mode === 'vocab') return unit.vocab;
  if (s.mode === 'grammar') return unit.grammar;
  if (s.mode === 'listening') return unit.listening;
  return unit.speaking;
});

const item = computed(() => items.value[s.idx] || {});
const total = computed(() => items.value.length || 1);
// 单词模式为环形学习序，进度看「已学个数」；其余模式为线性顺序
const pct = computed(() => {
  if (s.mode === 'vocab') return Math.round((s.ratings.length / total.value) * 100);
  return Math.round((s.idx / total.value) * 100);
});
const prevState = computed(() => {
  const up = (courseState.course.progress || {})[unit ? unit.id : ''] || {};
  const lp = up[lesson ? lesson.id : ''] || {};
  return lp[s.mode] || null;
});
const firstTime = computed(() => !(prevState.value && prevState.value.completed));
const grammarParts = computed(() => String(item.value.q || '').split('___'));

function resetSession(mode) {
  if (recorder) { recorder.cancel(); recorder = null; }
  if (s.audioUrl) { URL.revokeObjectURL(s.audioUrl); s.audioUrl = ''; }
  s.mode = mode;
  s.idx = 0;
  s.flipped = false;
  s.ratings = [];
  s.selected = null;
  s.checked = false;
  s.correct = 0;
  s.results = [];
  s.score = null;
  s.metrics = null;
  s.advice = '';
  s.source = '';
  s.recording = false;
  s.recordTime = 0;
  s.level = 0;
  s.wave = [];
  s.fallback = false;
  s.evaluating = false;
  s.done = false;
  s.summary = null;
  s.burst = mode === 'vocab' ? 'idle' : 'done';
}

/* ---------- 单词贴纸包：拆包 → 贴纸散开 → 点选学习 ---------- */
function burstWords() {
  if (s.burst !== 'idle') return;
  s.burst = 'bursting';
  setTimeout(() => { if (s.burst === 'bursting') s.burst = 'spread'; }, 640);
}

function chipStyle(i) {
  const spot = CHIP_SPOTS[i % CHIP_SPOTS.length];
  return {
    '--tx': spot.x + 'px',
    '--ty': spot.y + 'px',
    '--rot': spot.r + 'deg',
    '--pi': i
  };
}

function learnChip(i) {
  s.idx = i;
  s.flipped = false;
  s.burst = 'done';
}

function skipBurst() {
  s.idx = 0;
  s.flipped = false;
  s.burst = 'done';
}

function goMode(mode) {
  if (mode === s.mode || !lesson.modes.includes(mode)) return;
  resetSession(mode);
  router.replace(`/practice/${unit.id}/${lesson.id}/${mode}`);
}

function onFlip() {
  s.flipped = !s.flipped;
}

function playWord() {
  speak(item.value.v).then((ok) => {
    if (ok === false) showToast('TTS 未就绪，暂时没有声音');
  });
}

function playAudio() {
  speak(item.value.audio).then((ok) => {
    if (ok === false) showToast('TTS 未就绪，暂时没有声音');
  });
}

function playDemo() {
  speak(item.value.text).then((ok) => {
    if (ok === false) showToast('TTS 未就绪，暂时没有声音');
  });
}

/* ---------- 单词：自评生疏 / 一般 / 掌握（环形学习序：从点选的词开始，绕回直到全部学过） ---------- */
function rateWord(level) {
  const points = { hard: 40, good: 70, easy: 100 };
  s.ratings.push(points[level] || 60);
  if (s.ratings.length >= total.value) {
    const avg = Math.round(s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length);
    finish(avg);
  } else {
    s.idx = (s.idx + 1) % total.value;
    s.flipped = false;
  }
}

/* ---------- 语法 / 听力选择题 ---------- */
function pickOption(i) {
  if (s.checked) return;
  s.selected = i;
}

function checkAnswer() {
  if (s.checked || s.selected == null) return;
  s.checked = true;
  if (s.selected === item.value.answer) s.correct += 1;
}

function nextQuestion() {
  if (s.idx < total.value - 1) {
    s.idx += 1;
    s.selected = null;
    s.checked = false;
  } else {
    finish(Math.round((s.correct / total.value) * 100));
  }
}

function optionClass(i) {
  if (!s.checked) return s.selected === i ? 'is-picked' : '';
  if (i === item.value.answer) return 'is-correct';
  if (i === s.selected) return 'is-wrong';
  return '';
}

/* ---------- 口语：示范 → 录音 → 评分 → 回放 ---------- */
const EXPECTED_PER_CHAR = 0.24;

function expectedSeconds(text) {
  const chars = String(text).replace(/[。、！？,.!?\s]/g, '').length;
  return Math.max(2, chars * EXPECTED_PER_CHAR);
}

async function onRecordToggle() {
  if (s.evaluating) return;
  if (s.recording) {
    s.recording = false;
    const res = recorder ? await recorder.stop() : null;
    recorder = null;
    if (!res || !res.blob || res.duration < 0.6) {
      if (res && res.duration > 0) showToast('太短了，读慢一点');
      return;
    }
    applyLocalScore(res);
    if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
    s.audioUrl = URL.createObjectURL(res.blob);
    if (getCaps().asr) uploadForAiScore(res.blob);
    return;
  }

  if (s.audioUrl) { URL.revokeObjectURL(s.audioUrl); s.audioUrl = ''; }
  s.score = null;
  s.metrics = null;
  s.advice = '';
  s.fallback = false;
  s.recordTime = 0;
  s.wave = [];
  try {
    if (!recorder) recorder = createRecorder();
    s.recording = true;
    await recorder.start({
      maxSeconds: 30,
      onTick: (sec) => {
        s.recordTime = sec;
        if (sec >= 30) onRecordToggle();
      },
      onLevel: (lv) => {
        s.level = lv;
        s.wave = s.wave.concat([lv]).slice(-26);
      }
    });
  } catch (e) {
    s.recording = false;
    recorder = null;
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError');
    if (denied) {
      applyDemoScore();
      showToast('麦克风不可用，已切换为演示评分');
    } else {
      showToast('录音启动失败，已切换为演示评分');
      applyDemoScore();
    }
  }
}

function applyLocalScore(res) {
  const expected = expectedSeconds(item.value.text);
  const match = Math.max(0, 1 - Math.abs(res.duration - expected) / expected);
  const peak = s.wave.length
    ? s.wave.slice().sort((a, b) => b - a).slice(0, Math.max(1, Math.floor(s.wave.length * 0.2))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(s.wave.length * 0.2))
    : 0.35;
  const complete = Math.round(Math.min(98, Math.max(45, 55 + match * 32 + Math.min(12, peak * 25))));
  s.metrics = {
    complete,
    rhythm: Math.round(Math.min(100, Math.max(35, match * 100))),
    clarity: Math.round(Math.min(100, Math.max(40, 55 + peak * 60)))
  };
  s.score = complete;
  s.results[s.idx] = complete;
  s.source = 'local';
  s.fallback = false;
}

function applyDemoScore() {
  const demo = 76 + Math.floor(Math.random() * 12);
  s.score = demo;
  s.metrics = { complete: demo, rhythm: 74, clarity: 78 };
  s.results[s.idx] = demo;
  s.source = 'demo';
  s.fallback = true;
}

function uploadForAiScore(blob) {
  if (s.evaluating) return;
  s.evaluating = true;
  const targetIdx = s.idx;
  const file = new File([blob], 'record.wav', { type: 'audio/wav' });
  uploadFile('/api/pronounce', file, { target: item.value.text })
    .then((r) => {
      s.evaluating = false;
      // 用户已切到下一句或离开本模式时，丢弃过期结果
      if (s.done || s.idx !== targetIdx) return;
      if (!r || typeof r.score !== 'number') return;
      s.score = Math.round(r.score);
      s.metrics = {
        complete: Math.round(r.score),
        rhythm: s.metrics ? s.metrics.rhythm : 75,
        clarity: s.metrics ? s.metrics.clarity : 78
      };
      s.advice = r.advice || '';
      s.source = 'ai';
      s.results[s.idx] = s.score;
    })
    .catch(() => {
      s.evaluating = false;
      showToast('AI 评分暂不可用，已使用本地节奏评分');
    });
}

function reRecord() {
  if (s.audioUrl) { URL.revokeObjectURL(s.audioUrl); s.audioUrl = ''; }
  s.evaluating = false;
  s.score = null;
  s.metrics = null;
  s.advice = '';
  s.source = '';
  s.fallback = false;
  s.recording = false;
  s.wave = [];
  s.level = 0;
}

function nextSpeaking() {
  if (s.audioUrl) { URL.revokeObjectURL(s.audioUrl); s.audioUrl = ''; }
  s.evaluating = false;
  if (s.idx < total.value - 1) {
    s.idx += 1;
    s.score = null;
    s.metrics = null;
    s.advice = '';
    s.source = '';
    s.fallback = false;
    s.recording = false;
    s.wave = [];
    s.level = 0;
  } else {
    const sum = s.results.reduce((a, b) => a + (b || 0), 0);
    finish(Math.round(sum / total.value));
  }
}

function showWave() {
  return s.recording ? s.wave : Array.from({ length: 26 }, (_, i) => 0.12 + ((i * 7) % 9) * 0.03);
}

/* ---------- 结算 ---------- */
async function finish(rawScore) {
  if (s.done || !unit || !lesson) return;
  const score = Math.max(0, Math.min(100, Math.round(rawScore || 0)));
  s.done = true;
  s.summary = { score, gain: 0, streak: courseState.course.streak || 0, saving: true, title: unit.zh };
  if (s.audioUrl) { URL.revokeObjectURL(s.audioUrl); s.audioUrl = ''; }
  if (recorder) { recorder.cancel(); recorder = null; }
  s.recording = false;
  try {
    const res = await submitProgress({
      unitId: unit.id,
      lessonId: lesson.id,
      mode: s.mode,
      score,
      minutes: Math.max(2, Math.round(lesson.minutes / Math.max(1, lesson.modes.length)))
    });
    s.summary = {
      score,
      gain: res.gain || 0,
      streak: courseState.course.streak || 0,
      saving: false,
      title: unit.zh
    };
  } catch (e) {
    s.summary = { score, gain: 0, streak: courseState.course.streak || 0, saving: false, title: unit.zh, offline: true };
    showToast(e && e.offline ? '已离线保存，联网后自动同步进度' : '进度暂未同步，请检查后端');
  }
}

function retry() {
  resetSession(s.mode);
}

function backToCourse() {
  router.push('/course');
}

function goProgress() {
  router.push('/progress');
}

const xpPreview = computed(() => (firstTime.value ? 20 : 5));

onMounted(() => {
  loadCourse().then(() => { loading.value = false; });
  loadCaps();
});

watch(() => route.params.mode, (m) => {
  if (!m || !lesson || !lesson.modes.includes(m)) return;
  if (m !== s.mode) resetSession(m);
});

onBeforeUnmount(() => {
  if (recorder) recorder.cancel();
  if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
});
</script>

<template>
  <div v-if="unit && lesson" class="practice page">
    <!-- 顶部 -->
    <header class="phead rise rise-1">
      <button class="pback" aria-label="返回课程" @click="backToCourse">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div class="phead-copy">
        <div class="phead-kicker">{{ unit.level }} · {{ unit.title }}</div>
        <div class="phead-title">{{ MODE_META[s.mode].label }}</div>
      </div>
      <span class="xp-chip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4L12 3Z" /></svg>
        {{ s.done ? '+' + (s.summary ? s.summary.gain : 0) : '+' + xpPreview }} XP
      </span>
    </header>

    <!-- 模式切换 -->
    <div class="mode-switch rise rise-1">
      <button
        v-for="m in lesson.modes"
        :key="m"
        class="mode-pill"
        :class="{ 'is-active': m === s.mode }"
        @click="goMode(m)"
      >{{ MODE_META[m].label }}</button>
    </div>

    <div class="prog-line"><span :style="{ width: s.done ? '100%' : pct + '%' }"></span></div>

    <!-- ===== 结算 ===== -->
    <section v-if="s.done && s.summary" class="summary card rise rise-2">
      <div class="sum-ring">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#EDEDEA" stroke-width="10" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke="#A9783D" stroke-width="10" stroke-linecap="round"
            :stroke-dasharray="2 * Math.PI * 52"
            :stroke-dashoffset="2 * Math.PI * 52 * (1 - s.summary.score / 100)"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div class="sum-score num">{{ s.summary.score }}<small>分</small></div>
      </div>
      <div class="sum-kicker">MODULE COMPLETE</div>
      <h2 class="sum-title">{{ s.summary.score >= 90 ? '漂亮收尾' : s.summary.score >= 75 ? '稳稳完成' : '完成就是进步' }}</h2>
      <p class="cap">{{ s.summary.title }} · {{ lesson.title }} · {{ MODE_META[s.mode].label }}</p>

      <div class="sum-stats">
        <div class="sum-stat"><strong class="num">{{ s.summary.score }}</strong><span>本次评分</span></div>
        <div class="sum-stat"><strong class="num">+{{ s.summary.gain }}</strong><span>获得 XP</span></div>
        <div class="sum-stat"><strong class="num">{{ s.summary.streak }}</strong><span>连续天数</span></div>
      </div>
      <div v-if="s.summary.offline" class="cap sum-offline">网络异常 · 已离线保存，联网后自动同步</div>

      <div class="sum-actions">
        <button class="btn btn-ghost btn-pill" @click="backToCourse">返回课程</button>
        <button class="btn btn-primary btn-pill" @click="retry">再练一次</button>
      </div>
      <button class="sum-link" @click="goProgress">查看学习进度 →</button>
    </section>

    <!-- ===== 单词闪卡 ===== -->
    <template v-else-if="s.mode === 'vocab'">
      <!-- 词包场景：拆包后单词贴纸散开，点选学习 -->
      <div v-if="s.burst !== 'done'" class="vocab-pack" :class="'is-' + s.burst">
        <div class="step-head rise rise-2">
          <span class="kicker">WORD PACK · {{ total }} 장</span>
          <h2 class="step-title">拆开这一单元的词包</h2>
        </div>
        <div class="pack-stage">
          <button class="pack" :disabled="s.burst !== 'idle'" aria-label="拆开词包" @click="burstWords">
            <span class="pack-kicker">오늘의 단어</span>
            <strong class="pack-title">단어 팩</strong>
            <span class="pack-sub">{{ unit.level }} · {{ total }} 张贴纸</span>
          </button>
          <button
            v-for="(w, i) in unit.vocab"
            :key="w.v"
            class="word-chip"
            :style="chipStyle(i)"
            :aria-label="'学习单词 ' + w.v"
            @click="learnChip(i)"
          >
            <span class="chip-word">{{ w.v }}</span>
            <span class="chip-roman">{{ w.r }}</span>
          </button>
        </div>
        <button class="pack-skip" @click="skipBurst">不拆了，直接逐张学习 →</button>
      </div>

      <!-- 逐卡学习流 -->
      <template v-else>
        <div class="step-head rise rise-2">
          <span class="kicker">WORD DECK · {{ s.ratings.length + 1 }} / {{ total }}</span>
          <h2 class="step-title">先猜，再翻面</h2>
        </div>

        <FlashCard3D
          :word="item"
          :flipped="s.flipped"
          :tag="unit.level + ' · 단어'"
          class="rise rise-2"
          @toggle="onFlip"
        />

        <div class="flash-actions rise rise-3">
          <button class="btn btn-ghost btn-pill" @click="playWord">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6.5 9H3v6h3.5L11 19V5Z" /><path d="M15 9.5a4 4 0 0 1 0 5" /></svg>
            听发音
          </button>
          <button class="btn btn-primary btn-pill" @click="onFlip">
            {{ s.flipped ? '翻回正面' : '翻面看释义' }}
          </button>
        </div>

        <div v-if="s.flipped" class="rate-row rise rise-3">
          <button class="rate-btn rate-hard" @click="rateWord('hard')">
            <strong>生疏</strong><small>很快再见</small>
          </button>
          <button class="rate-btn rate-good" @click="rateWord('good')">
            <strong>一般</strong><small>明天复习</small>
          </button>
          <button class="rate-btn rate-easy" @click="rateWord('easy')">
            <strong>掌握</strong><small>拉长间隔</small>
          </button>
        </div>
        <div v-else class="cap center hint-soft">点击卡片或按钮翻面，再自评熟悉程度</div>
      </template>

      <div class="meta-foot">
        <span>已复习 {{ s.ratings.length }} / {{ total }}</span>
        <span v-if="prevState">历史最佳 {{ prevState.best }} 分</span>
        <span v-else>首次学习 · +20 XP</span>
      </div>
    </template>

    <!-- ===== 语法 / 听力 ===== -->
    <template v-else-if="s.mode === 'grammar' || s.mode === 'listening'">
      <div class="step-head rise rise-2">
        <span class="kicker">{{ s.mode === 'grammar' ? 'GRAMMAR DRILL' : 'LISTENING LAB' }} · {{ s.idx + 1 }} / {{ total }}</span>
        <h2 class="step-title">{{ s.mode === 'grammar' ? '选出最自然的那一句' : '先听，再判断' }}</h2>
      </div>

      <div v-if="s.mode === 'listening'" class="audio-card rise rise-2">
        <button class="play-big" aria-label="播放音频" @click="playAudio">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5L8 5.5Z" /></svg>
        </button>
        <div class="audio-wave" aria-hidden="true">
          <span v-for="i in 22" :key="i" :style="{ height: (6 + ((i * 7) % 16)) + 'px' }"></span>
        </div>
        <span class="audio-hint">点击播放</span>
      </div>

      <section class="card quiz-card rise rise-2">
        <template v-if="s.mode === 'grammar'">
          <div class="quiz-meta"><span>{{ unit.zh }}</span><span>{{ unit.level }} · {{ unit.title }}</span></div>
          <div class="quiz-q">
            {{ grammarParts[0] }}<span class="blank">＿＿</span>{{ grammarParts[1] }}
          </div>
        </template>
        <div v-else class="quiz-q listen-q">{{ item.q }}</div>

        <div class="options">
          <button
            v-for="(opt, i) in item.options"
            :key="i"
            class="option"
            :class="optionClass(i)"
            :disabled="s.checked"
            @click="pickOption(i)"
          >
            <span class="option-key">{{ String.fromCharCode(65 + i) }}</span>
            <span class="option-text">{{ opt }}</span>
            <span v-if="s.checked && i === item.answer" class="option-mark ok">✓</span>
            <span v-else-if="s.checked && i === s.selected" class="option-mark no">✕</span>
          </button>
        </div>

        <div v-if="s.checked" class="feedback" :class="s.selected === item.answer ? 'fb-ok' : 'fb-no'">
          <strong>{{ s.selected === item.answer ? '答对了' : '还差一点' }}</strong>
          <p v-if="s.mode === 'grammar'">{{ item.explain }}</p>
          <template v-else>
            <p>原文：{{ item.audio }}</p>
            <p class="fb-zh">{{ item.zh }}</p>
          </template>
        </div>

        <div class="quiz-actions">
          <button v-if="!s.checked" class="btn btn-primary btn-pill" :disabled="s.selected == null" @click="checkAnswer">确认答案</button>
          <button v-else class="btn btn-primary btn-pill" @click="nextQuestion">
            {{ s.idx === total - 1 ? '查看结果' : '下一题' }} →
          </button>
        </div>
      </section>

      <div class="meta-foot">
        <span>答对 {{ s.correct }} / {{ total }}</span>
        <span v-if="prevState">历史最佳 {{ prevState.best }} 分</span>
        <span v-else>首次学习 · +20 XP</span>
      </div>
    </template>

    <!-- ===== 口语跟读 ===== -->
    <template v-else>
      <div class="step-head rise rise-2">
        <span class="kicker">SHADOWING · {{ s.idx + 1 }} / {{ total }}</span>
        <h2 class="step-title">跟读示范，听见自己的声音</h2>
      </div>

      <section class="card speak-card rise rise-2">
        <div class="speak-label">TODAY'S SENTENCE</div>
        <div class="speak-sentence">{{ item.text }}</div>
        <div class="speak-zh">{{ item.zh }}</div>
        <div class="speak-tip">{{ item.tip }}</div>

        <div class="record-row">
          <button class="btn btn-ghost btn-pill" @click="playDemo">听示范</button>
          <button class="record-btn" :class="{ 'is-recording': s.recording }" :aria-label="s.recording ? '停止录音' : '开始录音'" @click="onRecordToggle">
            <svg v-if="!s.recording" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
          </button>
          <div class="record-hint">
            <span v-if="s.recording" class="num">{{ s.recordTime }}s · 再次点击停止并评分</span>
            <span v-else-if="s.evaluating && s.score == null">AI 评分中…</span>
            <span v-else>点击麦克风，跟读这一句</span>
          </div>
        </div>

        <div class="wave" :class="{ 'is-live': s.recording }" aria-hidden="true">
          <span v-for="(v, i) in showWave()" :key="i" :style="{ height: Math.max(4, Math.round(v * 38)) + 'px' }"></span>
        </div>

        <div v-if="s.score != null" class="score-panel">
          <div class="score-side">
            <div class="score-num num">{{ s.score }}<small>分</small></div>
            <div class="score-caption">
              {{ s.score >= 90 ? '非常接近示范' : s.score >= 78 ? '节奏已经不错' : '再放慢一点' }}
            </div>
            <div class="score-source">
              {{ s.source === 'ai' ? 'AI 语音评测' : (s.fallback ? '演示评分' : '本地节奏评分') }}
            </div>
          </div>
          <div class="score-bars">
            <div class="score-bar-row"><span>完整度</span><div class="bar-track"><div class="bar-fill" :style="{ width: s.metrics.complete + '%' }"></div></div><span class="num">{{ s.metrics.complete }}</span></div>
            <div class="score-bar-row"><span>节奏</span><div class="bar-track"><div class="bar-fill" :style="{ width: s.metrics.rhythm + '%' }"></div></div><span class="num">{{ s.metrics.rhythm }}</span></div>
            <div class="score-bar-row"><span>清晰度</span><div class="bar-track"><div class="bar-fill" :style="{ width: s.metrics.clarity + '%' }"></div></div><span class="num">{{ s.metrics.clarity }}</span></div>
          </div>
        </div>

        <div v-if="s.advice" class="speak-advice">{{ s.advice }}</div>
        <div v-if="s.fallback" class="cap fallback-tip">未获取麦克风，本次为演示评分，可继续体验流程</div>

        <audio v-if="s.audioUrl" class="rec-audio" :src="s.audioUrl" controls preload="metadata"></audio>

        <div class="speak-actions">
          <button v-if="s.score != null" class="btn btn-ghost btn-pill" @click="reRecord">重录</button>
          <button class="btn btn-primary btn-pill" :disabled="s.score == null" @click="nextSpeaking">
            {{ s.idx === total - 1 ? '完成跟读' : '下一句' }} →
          </button>
        </div>
      </section>

      <div class="meta-foot">
        <span>已练 {{ s.idx + (s.score != null ? 1 : 0) }} / {{ total }}</span>
        <span v-if="prevState">历史最佳 {{ prevState.best }} 分</span>
        <span v-else>首次学习 · +20 XP</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  padding: 18px 14px calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 40px);
  min-height: 100dvh;
}

/* 顶部 */
.phead { display: flex; align-items: center; gap: 10px; margin: 0 2px 12px; }
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
.phead-kicker { font-size: 11px; color: var(--ink-3); letter-spacing: .04em; }
.phead-title { font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
.xp-chip {
  flex: none;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: 11px; font-weight: 700;
}
.xp-chip svg { width: 12px; height: 12px; }

/* 模式切换 */
.mode-switch { display: flex; gap: 6px; overflow-x: auto; padding: 2px; scrollbar-width: none; }
.mode-switch::-webkit-scrollbar { display: none; }
.mode-pill {
  flex: none;
  padding: 7px 13px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 12px; font-weight: 600;
  transition: all .18s ease;
}
.mode-pill.is-active { background: var(--ink); border-color: var(--ink); color: #fff; }
.prog-line { height: 3px; margin: 12px 2px 16px; background: var(--line); border-radius: 999px; overflow: hidden; }
.prog-line span { display: block; height: 100%; background: var(--accent); transition: width .35s cubic-bezier(.22,.61,.36,1); }

/* 步骤标题 */
.step-head { margin: 0 6px 12px; }
.kicker { font-size: 10px; font-weight: 800; letter-spacing: .1em; color: var(--ink-3); }
.step-title { margin-top: 4px; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }

/* 单词卡 */
.flash-actions { display: flex; gap: 10px; margin: 12px 4px 0; }
.flash-actions .btn { flex: 1; }
.flash-actions svg { width: 15px; height: 15px; }
.rate-row { display: flex; gap: 8px; margin: 12px 4px 0; }
.rate-btn {
  flex: 1;
  padding: 12px 8px 10px;
  border-radius: var(--radius-m);
  border: 1px solid var(--line);
  background: var(--surface);
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  transition: transform .15s ease, border-color .18s ease, background .18s ease;
}
.rate-btn:active { transform: scale(0.965); }
.rate-btn strong { font-size: 14px; font-weight: 700; }
.rate-btn small { font-size: 10px; color: var(--ink-3); }
.rate-hard strong { color: var(--danger); }
.rate-good strong { color: var(--ink); }
.rate-easy strong { color: var(--ok); }
.hint-soft { margin: 14px 0 0; text-align: center; }
.center { text-align: center; }

/* ===== 单词贴纸包 ===== */
.vocab-pack { display: flex; flex-direction: column; align-items: center; }
.pack-stage { position: relative; width: 100%; height: 388px; }
.pack {
  position: absolute; left: 50%; top: 46%;
  transform: translate(-50%, -50%);
  width: 138px; height: 164px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: var(--surface-2);
  border: 1px solid rgba(32, 39, 37, .22);
  border-radius: 10px;
  box-shadow: 0 14px 26px rgba(44, 42, 35, .16), 6px 7px 0 #d4cec1;
  -webkit-mask: radial-gradient(26px 20px at 50% 0, transparent 25px, #000 26px);
  mask: radial-gradient(26px 20px at 50% 0, transparent 25px, #000 26px);
  cursor: pointer;
  transition: transform .25s cubic-bezier(.22, .61, .36, 1), box-shadow .25s ease;
}
@media (hover: hover) {
  .vocab-pack.is-idle .pack:hover { transform: translate(-50%, -54%); box-shadow: 0 20px 32px rgba(44, 42, 35, .2), 8px 9px 0 #d4cec1; }
}
.pack-kicker { font-size: 8px; font-weight: 700; letter-spacing: .18em; color: var(--accent-deep); }
.pack-title { font-family: var(--font-display); font-size: 21px; font-weight: 700; color: var(--ink); }
.pack-sub { font-size: 9px; color: var(--ink-3); }
.vocab-pack.is-bursting .pack { animation: pack-burst .58s cubic-bezier(.36, 0, .66, -.56) both; pointer-events: none; }
.vocab-pack.is-spread .pack { opacity: 0; transform: translate(-50%, -30%) scale(.88) rotate(-6deg); transition: opacity .3s ease, transform .4s ease; pointer-events: none; }
@keyframes pack-burst {
  0% { transform: translate(-50%, -50%) scale(1) rotate(0); }
  30% { transform: translate(-50%, -50%) scale(1.09) rotate(-4deg); }
  60% { transform: translate(-50%, -42%) scale(1.05) rotate(3deg); opacity: 1; }
  100% { transform: translate(-50%, -20%) scale(.86) rotate(-8deg); opacity: 0; }
}
.word-chip {
  position: absolute; left: 50%; top: 47%;
  width: 122px;
  padding: 11px 12px 10px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  background: var(--surface);
  border: 1px solid rgba(32, 39, 37, .24);
  border-radius: 9px;
  box-shadow: 0 8px 16px rgba(44, 42, 35, .13);
  text-align: left;
  opacity: 0;
  transform: translate(-50%, -50%) scale(.35) rotate(0deg);
  pointer-events: none;
}
.vocab-pack.is-spread .word-chip {
  opacity: 1;
  transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)) scale(1);
  transition:
    transform .58s cubic-bezier(.16, 1, .3, 1) calc(var(--pi) * 62ms),
    opacity .38s ease calc(var(--pi) * 62ms + .08s);
  pointer-events: auto;
}
.word-chip:active { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)) scale(.94); }
.chip-word { font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: -.01em; }
.chip-roman { font-size: 10px; color: var(--ink-3); }
.pack-skip {
  margin-top: 2px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--ink-3);
}
@media (prefers-reduced-motion: reduce) {
  .pack, .word-chip { transition: none; animation: none; }
  .vocab-pack.is-spread .word-chip { opacity: 1; }
}
.meta-foot {
  display: flex; justify-content: space-between;
  margin: 16px 6px 0;
  font-size: 11px; color: var(--ink-3);
}

/* 听力 */
.audio-card {
  display: flex; align-items: center; gap: 14px;
  margin: 4px 4px 12px;
  padding: 14px 16px;
  border-radius: var(--radius-l);
  background: var(--ink);
  color: #fff;
}
.play-big {
  width: 46px; height: 46px; flex: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease, background .18s ease;
}
.play-big:active { transform: scale(0.94); background: rgba(255,255,255,0.2); }
.play-big svg { width: 20px; height: 20px; }
.audio-wave { flex: 1; display: flex; align-items: center; gap: 3px; height: 30px; }
.audio-wave span { width: 3px; border-radius: 999px; background: rgba(255,255,255,0.45); }
.audio-hint { flex: none; font-size: 10px; color: rgba(255,255,255,0.55); }

/* 选择题 */
.quiz-card { margin: 0 0 0; }
.quiz-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-3); }
.quiz-q { margin: 10px 0 16px; font-size: 19px; font-weight: 700; line-height: 1.5; }
.listen-q { font-size: 16px; font-weight: 600; }
.blank { display: inline-block; min-width: 46px; border-bottom: 2px solid var(--accent); color: var(--accent); text-align: center; }
.options { display: flex; flex-direction: column; gap: 8px; }
.option {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 13px;
  border-radius: var(--radius-m);
  border: 1px solid var(--line);
  background: var(--surface);
  text-align: left;
  font-size: 14px;
  transition: border-color .18s ease, background .18s ease, transform .12s ease;
}
.option:active:not(:disabled) { transform: scale(0.985); }
.option.is-picked { border-color: var(--accent); background: var(--accent-soft); }
.option.is-correct { border-color: var(--ok); background: var(--ok-soft); }
.option.is-wrong { border-color: var(--danger); background: var(--danger-soft); }
.option-key {
  width: 22px; height: 22px; flex: none;
  border-radius: 50%;
  border: 1px solid var(--line-2);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: var(--ink-2);
}
.option.is-correct .option-key { border-color: var(--ok); color: var(--ok); }
.option.is-wrong .option-key { border-color: var(--danger); color: var(--danger); }
.option-text { flex: 1; }
.option-mark { font-size: 13px; font-weight: 800; }
.option-mark.ok { color: var(--ok); }
.option-mark.no { color: var(--danger); }

.feedback {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-m);
  font-size: 13px;
  line-height: 1.65;
}
.feedback strong { display: block; margin-bottom: 2px; font-size: 13px; }
.feedback p { margin: 2px 0 0; }
.fb-ok { background: var(--ok-soft); color: #1B5D4E; }
.fb-no { background: var(--danger-soft); color: #8E2B27; }
.fb-zh { color: var(--ink-2); }
.quiz-actions { margin-top: 16px; display: flex; justify-content: flex-end; }

/* 口语 */
.speak-card { margin: 0; }
.speak-label { font-size: 10px; font-weight: 800; letter-spacing: .1em; color: var(--ink-3); }
.speak-sentence { margin: 10px 0 4px; font-size: 24px; font-weight: 800; line-height: 1.4; letter-spacing: -0.01em; }
.speak-zh { font-size: 13px; color: var(--ink-2); }
.speak-tip { margin-top: 10px; padding: 8px 10px; border-radius: var(--radius-s); background: var(--surface-2); font-size: 11px; color: var(--ink-2); }
.record-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.record-btn {
  width: 58px; height: 58px; flex: none;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 18px rgba(20,21,25,0.18);
  transition: transform .16s ease, background .18s ease;
}
.record-btn svg { width: 26px; height: 26px; }
.record-btn:active { transform: scale(0.95); }
.record-btn.is-recording { background: var(--danger); animation: rec-pulse 1.4s ease-in-out infinite; }
@keyframes rec-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(196,61,56,0.32); }
  50% { box-shadow: 0 0 0 12px rgba(196,61,56,0); }
}
.record-hint { flex: 1; font-size: 12px; color: var(--ink-3); line-height: 1.5; }
.wave { display: flex; align-items: center; justify-content: center; gap: 3px; height: 42px; margin-top: 12px; }
.wave span { width: 3px; border-radius: 999px; background: var(--line-2); transition: height .08s linear; }
.wave.is-live span { background: var(--accent); }

.score-panel {
  display: flex; gap: 16px;
  margin-top: 14px;
  padding: 14px;
  border-radius: var(--radius-m);
  background: var(--surface-2);
}
.score-side { flex: none; min-width: 92px; }
.score-num { font-size: 36px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; color: var(--accent-deep); }
.score-num small { font-size: 12px; font-weight: 600; color: var(--ink-3); margin-left: 2px; }
.score-caption { margin-top: 4px; font-size: 11px; color: var(--ink-2); }
.score-source { margin-top: 4px; font-size: 10px; color: var(--ink-3); }
.score-bars { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.score-bar-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--ink-2); }
.score-bar-row > span:first-child { width: 42px; flex: none; }
.score-bar-row > span:last-child { width: 24px; text-align: right; flex: none; }
.bar-track { flex: 1; height: 5px; border-radius: 999px; background: var(--line); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width .45s cubic-bezier(.22,.61,.36,1); }
.speak-advice { margin-top: 10px; font-size: 12px; color: var(--ink-2); line-height: 1.6; }
.fallback-tip { margin-top: 8px; }
.rec-audio { width: 100%; margin-top: 12px; height: 34px; }
.speak-actions { display: flex; gap: 10px; margin-top: 16px; }
.speak-actions .btn { flex: 1; }

/* 结算 */
.summary { margin: 4px 0 0; text-align: center; }
.sum-ring { position: relative; width: 128px; height: 128px; margin: 4px auto 6px; }
.sum-ring svg { width: 100%; height: 100%; }
.sum-score {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 34px; font-weight: 800; letter-spacing: -0.03em;
}
.sum-score small { font-size: 12px; color: var(--ink-3); margin-left: 2px; font-weight: 600; }
.sum-kicker { font-size: 10px; font-weight: 800; letter-spacing: .12em; color: var(--ink-3); }
.sum-title { margin: 4px 0 2px; font-size: 20px; font-weight: 800; }
.sum-stats {
  display: flex; justify-content: space-around;
  margin: 18px 0 6px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.sum-stat { display: flex; flex-direction: column; gap: 2px; }
.sum-stat strong { font-size: 19px; font-weight: 800; }
.sum-stat span { font-size: 10px; color: var(--ink-3); }
.sum-offline { color: var(--danger); }
.sum-actions { display: flex; gap: 10px; margin-top: 16px; }
.sum-actions .btn { flex: 1; }
.sum-link {
  margin-top: 14px;
  font-size: 12px;
  color: var(--ink-3);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
