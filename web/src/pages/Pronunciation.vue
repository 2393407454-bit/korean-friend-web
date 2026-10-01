<script setup>
// 发音跟读页（自小程序 pages/pronunciation 移植）：
// 内置 6 课 + AI 动态课程；标准音 TTS；按住跟读录音 → /api/pronounce ASR+AI 评分；趋势/我会了落库
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { get, post, uploadFile } from '../api/client';
import { speak } from '../api/tts';
import { loadCaps, getCaps } from '../api/caps';
import { currentUid, storeGet, storeRemove } from '../utils/storage';
import { createRecorder } from '../utils/recorder';
import { showToast } from '../utils/ui';

const router = useRouter();

const LESSONS = [
  { id: 'L1', level: '入门', text: '안녕하세요', zh: '你好 / 您好', roman: 'an-nyeong-ha-se-yo',
    tip: '五个音节慢慢读：안 녕 하 세 요。「세」轻轻咬住，「요」收尾上扬像问号。' },
  { id: 'L2', level: '入门', text: '안녕히 가세요', zh: '慢走（主人对客人说）', roman: 'an-nyeong-hi ga-se-yo',
    tip: '「히」要送气，嘴唇别太用力；结尾 세요 上扬。' },
  { id: 'L3', level: '日常', text: '감사합니다', zh: '谢谢（最礼貌）', roman: 'gam-sa-ham-ni-da',
    tip: '收音「답」读 [m]，末尾读 ni-da，别读成「哈姆尼达」。' },
  { id: 'L4', level: '日常', text: '주문할게요', zh: '我要点餐了', roman: 'ju-mun-hal-ge-yo',
    tip: '「할」ㄹ收音弹一下上齿龈；「게」读 ge 不读 kei。' },
  { id: 'L5', level: '进阶', text: '사랑해요', zh: '我爱你', roman: 'sa-rang-hae-yo',
    tip: '两个 a 要清晰；랑해 之间 ㅎ 连读成 sa-rang-hae。' },
  { id: 'L6', level: '进阶', text: '여권 좀 보여 주세요', zh: '请出示一下护照', roman: 'yeo-gwon jom bo-yeo ju-se-yo',
    tip: '보여 주세요 连读，中间别停顿。' }
];

const data = reactive({
  lessons: LESSONS,
  currentIndex: 0,
  currentLesson: LESSONS[0],
  aiTarget: '', // 来自 AI 对话的跟读目标句（优先于课程）
  pronOpen: true,
  openIndex: -1,
  streak: 0,
  mastered: 0,
  pronTrend: [], // 最近 5 次真实评分
  recording: false,
  recordTime: 0,
  evaluating: false,
  lastEval: null,
  lessonsLoading: true,
  refreshing: false,
  evalScores: {}
});

let recorder = null;

// 当前实际跟读目标：AI 句子优先，否则用课程句
function currentTarget() {
  return data.aiTarget || data.currentLesson.text;
}

function loadStats() {
  // 真实连续天数 + 最近评分趋势：来自能力画像
  get('/api/abilities/' + currentUid()).then((res) => {
    if (!res || !res.stats) return;
    data.streak = res.stats.streak_days || 0;
    data.pronTrend = (res.pronLog || []).map((e) => e.score).slice(-5);
  }).catch(() => {});
  // 「我会了」计数
  get('/api/profile/' + currentUid()).then((res) => {
    const pm = res.progress || {};
    data.mastered = (pm.pron_mastered || []).length;
  }).catch(() => {});
}

/* === AI 动态课程 === */
function loadLessons(refresh) {
  if (refresh) data.refreshing = true;
  else data.lessonsLoading = true;
  post('/api/pronounce/lessons', { userId: currentUid(), refresh: !!refresh })
    .then((res) => {
      if (res && res.lessons && res.lessons.length) {
        data.lessons = res.lessons;
        data.lessonsLoading = false;
        data.refreshing = false;
        if (refresh) showToast('新课程已生成');
      } else {
        data.lessonsLoading = false;
        data.refreshing = false;
      }
    })
    .catch(() => {
      data.lessonsLoading = false;
      data.refreshing = false;
      if (refresh) showToast('生成失败，请重试');
    });
}

function onRefreshLessons() {
  if (data.refreshing) return;
  loadLessons(true);
}

/* === 播放标准音 === */
function onPlay() {
  speak(currentTarget()).then((ok) => {
    if (ok === false) showToast('TTS 未就绪，暂无声音');
  });
}

/* === 按住跟读：真实录音 + 计时 === */
async function onRecStart() {
  if (data.recording || data.evaluating) return;
  if (!getCaps().asr) {
    showToast('语音不可用：后端未配置 ASR');
    return;
  }
  try {
    if (!recorder) recorder = createRecorder();
    data.recording = true;
    data.recordTime = 0;
    data.lastEval = null;
    await recorder.start({
      maxSeconds: 30,
      onTick: (sec) => { data.recordTime = sec; }
    });
  } catch (e) {
    data.recording = false;
    showToast((e && e.name) === 'NotAllowedError' ? '麦克风权限被拒绝，请在浏览器设置中允许' : '录音启动失败');
  }
}

async function onRecEnd() {
  if (!data.recording) return;
  data.recording = false;
  const res = await recorder.stop();
  if (!res || !res.blob || res.duration < 0.7) {
    if (res && res.duration > 0) showToast('太短了，读慢一点~');
    return;
  }
  // 真实 AI 评分：录音 → 后端 ASR 识别 → AI 发音教练评价（结果落库进能力画像）
  const target = currentTarget();
  data.evaluating = true;
  const file = new File([res.blob], 'record.wav', { type: 'audio/wav' });
  uploadFile('/api/pronounce', file, { target, userId: currentUid() })
    .then((r) => {
      data.evaluating = false;
      data.evalScores = { ...data.evalScores, [target]: r.score };
      data.pronTrend = data.pronTrend.concat([r.score]).slice(-5);
      data.lastEval = {
        score: r.score,
        advice: r.advice || '',
        feedback: r.feedback || [],
        asr: r.asr_text || '',
        src: r.source || 'ai'
      };
    })
    .catch(() => {
      data.evaluating = false;
      showToast('评分失败，请确认后端已启动');
    });
}

/* === 我会了（真实落库，不编造） === */
function onEval() {
  const target = currentTarget();
  post('/api/pronounce/mastered', { userId: currentUid(), target })
    .then((res) => {
      data.mastered = (res && res.mastered) || data.mastered;
      showToast('已掌握：' + target.slice(0, 14));
    })
    .catch(() => showToast('未同步：请检查网络后重试'));
}

/* === 再试一次 === */
function onRetryPron() {
  showToast('按住麦克风再来一次', 1200);
}

/* === 课程卡片 === */
function onCardTap(i) {
  data.openIndex = data.openIndex === i ? -1 : i;
}

function onCardPlay(lesson) {
  speak(lesson.text).then((ok) => {
    if (ok === false) showToast('TTS 未就绪，暂无声音');
  });
}

function onCardGo(i) {
  const lesson = data.lessons[i];
  data.currentIndex = i;
  data.currentLesson = lesson;
  data.aiTarget = ''; // 选择课程会替换 AI 跟读目标
  data.pronOpen = true;
  data.openIndex = -1;
  data.lastEval = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function levelClass(level) {
  return level === '入门' ? 'lv-easy' : (level === '进阶' ? 'lv-hard' : 'lv-mid');
}

loadCaps();
loadStats();
loadLessons(false);

// 聊天页「跟读」带入的 AI 回复句子 → 置为当前跟读目标
const practiceTarget = storeGet('kfp_practice_target');
if (practiceTarget) {
  storeRemove('kfp_practice_target');
  data.aiTarget = practiceTarget;
  data.pronOpen = true;
  data.lastEval = null;
  showToast('跟读目标已就位');
}
</script>

<template>
  <div class="page page-tab">
    <!-- ===== 顶部 ===== -->
    <header class="hero rise rise-1">
      <div class="hero-text">
        <div class="h-page">발음 연습</div>
        <div class="hero-sub">像韩国人一样读</div>
      </div>
      <div class="hero-stats">
        <div class="hs-item"><span class="hs-v num">{{ data.streak || 0 }}</span><span class="hs-k">连续天数</span></div>
        <div class="hs-divider"></div>
        <div class="hs-item"><span class="hs-v num">{{ data.mastered || 0 }}</span><span class="hs-k">已掌握</span></div>
      </div>
    </header>

    <!-- ===== K-pop 学歌入口 ===== -->
    <button class="song-entry rise rise-2" @click="router.push('/song')">
      <span class="se-txt">
        <span class="se-t">K-pop 学歌</span>
        <span class="se-s">上传歌词 · AI 分句讲解 · 跟读评分</span>
      </span>
      <svg class="se-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
    </button>

    <!-- ===== 练习区 ===== -->
    <section class="card rise rise-2">
      <div class="card-head">
        <span class="h-sec">现在练习</span>
        <span class="tag" :class="data.aiTarget ? 'tag-accent' : ''">{{ data.aiTarget ? '来自 AI 对话' : data.currentLesson.level }}</span>
      </div>

      <div class="pron-main" :class="{ 'is-open': data.pronOpen }" @click="data.pronOpen = !data.pronOpen">
        <div class="pm-text">
          <div class="pm-ko">{{ data.aiTarget || data.currentLesson.text }}</div>
          <div class="pm-zh">{{ data.aiTarget ? '跟读这句话，AI 会给你评分' : data.currentLesson.zh }}</div>
        </div>
        <svg class="pm-chevron" :class="{ 'is-open': data.pronOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </div>

      <div v-if="data.pronOpen" class="pron-detail">
        <span class="pd-tag">{{ data.aiTarget ? '跟读提示' : '罗马音' }}</span>
        <div v-if="!data.aiTarget" class="pd-roman num">{{ data.currentLesson.roman }}</div>
        <div class="pd-tip">{{ data.aiTarget ? '先点「听标准」听一遍，再按住跟读。AI 会按发音、语调给你评分。' : data.currentLesson.tip }}</div>
        <div class="pd-row">
          <button class="btn btn-ghost btn-sm" @click.stop="onPlay">听标准</button>
          <button
            class="btn btn-sm rec-btn"
            :class="data.recording ? 'is-rec' : 'btn-primary'"
            :disabled="data.evaluating"
            @mousedown.prevent="onRecStart"
            @mouseup.prevent="onRecEnd"
            @mouseleave="data.recording && onRecEnd()"
            @touchstart.prevent="onRecStart"
            @touchend.prevent="onRecEnd"
          >{{ data.evaluating ? '评分中…' : (data.recording ? data.recordTime + 's · 松开结束' : '按住跟读') }}</button>
          <button class="btn btn-ghost btn-sm pd-eval" @click.stop="onEval">我会了</button>
        </div>
      </div>

      <!-- AI 评分反馈 -->
      <div v-if="data.lastEval" class="eval-card">
        <div class="eval-head">
          <span class="eval-score num">{{ data.lastEval.score || 0 }}</span>
          <span class="eval-unit">/100</span>
          <span v-if="data.lastEval.score >= 90" class="tag tag-ok" style="margin-left: auto;">完美</span>
          <span v-else-if="data.lastEval.score >= 70" class="tag tag-accent" style="margin-left: auto;">不错</span>
          <span v-else class="tag tag-danger" style="margin-left: auto;">加油</span>
        </div>
        <div v-if="data.lastEval.asr" class="eval-asr">AI 听到你说：{{ data.lastEval.asr }}</div>
        <div v-if="data.lastEval.advice" class="eval-tip">{{ data.lastEval.advice }}</div>
        <div v-if="data.lastEval.feedback && data.lastEval.feedback.length" class="eval-feedback">
          <span v-for="(f, fi) in data.lastEval.feedback" :key="fi" class="fb-chip" :class="f.ok ? 'is-ok' : 'is-bad'">
            {{ f.syl }}<span class="fb-mark">{{ f.ok ? '✓' : '✕' }}</span>
          </span>
        </div>
        <div class="eval-src">{{ data.lastEval.src === 'fallback' ? '依据：ASR 相似度估算（AI 评分暂不可用）' : '依据：ASR 识别 + AI 发音评测' }}</div>
        <button v-if="data.lastEval.score < 85" class="eval-retry" @click="onRetryPron">再试一次，冲击更高分</button>
      </div>

      <!-- 最近评分趋势 -->
      <div v-if="data.pronTrend.length >= 2" class="pron-trend">
        <span class="pt-label">最近评分</span>
        <template v-for="(v, vi) in data.pronTrend" :key="vi">
          <span class="pt-val num">{{ v }}</span>
          <span v-if="vi < data.pronTrend.length - 1" class="pt-arrow">→</span>
        </template>
      </div>

      <!-- 录音浮层 -->
      <div v-if="data.recording" class="rec-mask">
        <div class="rec-card">
          <span class="rec-badge">REC</span>
          <div class="wavebars">
            <span class="bar b1"></span><span class="bar b2"></span><span class="bar b3"></span><span class="bar b4"></span>
            <span class="bar b5"></span><span class="bar b6"></span><span class="bar b7"></span>
          </div>
          <div class="rec-hint">读：{{ data.aiTarget || data.currentLesson.text }}</div>
          <div class="rec-sub num">{{ data.recordTime }}s / 30s</div>
          <button class="rec-stop" @click="onRecEnd">结束并评分</button>
          <div class="rec-tip">松开麦克风或点上方按钮结束</div>
        </div>
      </div>
    </section>

    <!-- ===== 课程列表 ===== -->
    <section class="lessons rise rise-3">
      <div class="lessons-head">
        <span class="h-sec">AI 为你定制的课程</span>
        <button class="refresh-btn" :class="{ 'is-spinning': data.refreshing }" @click="onRefreshLessons">
          <svg class="rf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" /></svg>
          换一批
        </button>
      </div>

      <div v-if="data.lessonsLoading && !data.lessons.length" class="cards-wrap">
        <div v-for="i in 3" :key="i" class="lesson-card">
          <div class="sk-line sk-line-lg"></div>
          <div class="sk-line sk-line-sm"></div>
        </div>
      </div>

      <div v-else class="cards-wrap">
        <div v-for="(lesson, i) in data.lessons" :key="lesson.id" class="lesson-card"
          :class="{ 'is-active': i === data.currentIndex, 'is-open': data.openIndex === i }"
          @click="onCardTap(i)"
        >
          <span class="corner-lv" :class="levelClass(lesson.level)">{{ lesson.level }}</span>
          <span v-if="data.evalScores[lesson.text]" class="score-badge num">{{ data.evalScores[lesson.text] }} 分</span>

          <div class="lc-head">
            <div class="lc-title-group">
              <div class="lc-ko">{{ lesson.text }}</div>
              <div class="lc-zh">{{ lesson.zh }}</div>
            </div>
            <svg class="lc-chv" :class="{ 'is-open': data.openIndex === i }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </div>

          <div v-if="data.openIndex === i" class="lc-detail">
            <div class="lcd-roman">
              <span class="lcd-label">罗马音</span>
              <span class="lcd-val num">{{ lesson.roman }}</span>
            </div>
            <div class="lcd-tip">{{ lesson.tip }}</div>
            <div class="lcd-actions">
              <button class="btn btn-ghost btn-sm" @click.stop="onCardPlay(lesson)">听</button>
              <button class="btn btn-primary btn-sm lcd-go" @click.stop="onCardGo(i)">练它</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { padding: 20px 0 calc(var(--tabbar-h) + var(--floatbar-offset) + env(safe-area-inset-bottom) + 16px); }

/* ===== 顶部 ===== */
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 18px;
  margin-bottom: 14px;
}
.hero-sub { margin-top: 4px; font-size: 12px; color: var(--ink-3); }
.hero-stats { display: flex; align-items: center; gap: 14px; }
.hs-item { display: flex; flex-direction: column; align-items: center; }
.hs-v { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
.hs-k { font-size: 10px; color: var(--ink-3); }
.hs-divider { width: 1px; height: 26px; background: var(--line); }

/* ===== 学歌入口 ===== */
.song-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% - 28px);
  margin: 0 14px 12px;
  padding: 13px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-l);
  cursor: pointer;
  text-align: left;
}
.song-entry:active { background: var(--surface-2); }
.se-txt { display: flex; flex-direction: column; gap: 1px; }
.se-t { font-size: 14px; font-weight: 700; }
.se-s { font-size: 11px; color: var(--ink-3); }
.se-arrow { width: 16px; height: 16px; color: var(--ink-3); }

/* ===== 练习区 ===== */
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }

.pron-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 14px;
  background: var(--surface-2);
  border-radius: var(--radius-m);
  cursor: pointer;
}
.pm-ko { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); }
.pm-zh { margin-top: 2px; font-size: 12px; color: var(--ink-2); }
.pm-chevron { width: 17px; height: 17px; color: var(--ink-3); transition: transform .25s ease; flex: none; }
.pm-chevron.is-open { transform: rotate(180deg); }

.pron-detail { display: flex; flex-direction: column; gap: 9px; padding: 13px 2px 2px; }
.pd-tag {
  align-self: flex-start;
  font-size: 10px; font-weight: 700;
  letter-spacing: .06em;
  color: var(--ink-2);
  background: var(--surface-2);
  padding: 2px 9px;
  border-radius: var(--radius-pill);
}
.pd-roman {
  font-size: 14px; font-weight: 600;
  color: var(--accent-deep);
  padding: 7px 11px;
  background: var(--bg);
  border-radius: var(--radius-s);
  border: 1px dashed var(--line-2);
}
.pd-tip {
  font-size: 12.5px; line-height: 1.65;
  color: var(--ink-2);
  padding: 9px 12px;
  background: var(--bg);
  border-radius: var(--radius-s);
}

.pd-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; user-select: none; }
.btn-sm { padding: 8px 14px; font-size: 13px; border-radius: var(--radius-pill); touch-action: none; }
.pd-eval { margin-left: auto; }
.rec-btn { min-width: 118px; }
.rec-btn.is-rec {
  background: var(--danger);
  color: #fff;
  animation: rec-pulse 1.2s ease-in-out infinite;
}
@keyframes rec-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(196, 61, 56, 0.3); }
  50% { box-shadow: 0 0 0 5px rgba(196, 61, 56, 0.12); }
}

/* ===== 评分卡 ===== */
.eval-card {
  margin-top: 12px;
  padding: 13px 14px;
  background: var(--bg);
  border-radius: var(--radius-m);
}
.eval-head { display: flex; align-items: baseline; gap: 3px; }
.eval-score {
  font-size: 30px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--ink);
  line-height: 1;
}
.eval-unit { font-size: 11px; font-weight: 600; color: var(--ink-3); }
.eval-asr {
  margin-top: 9px;
  font-size: 12px; color: var(--accent-deep);
  background: var(--accent-soft);
  border-radius: var(--radius-s);
  padding: 6px 10px;
}
.eval-tip {
  margin-top: 8px;
  font-size: 13px; font-weight: 500;
  line-height: 1.7;
  color: var(--ink);
}
.eval-feedback { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px; }
.fb-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  font-size: 12px; font-weight: 600;
}
.fb-chip.is-ok { background: var(--ok-soft); color: var(--ok); }
.fb-chip.is-bad { background: var(--danger-soft); color: var(--danger); }
.fb-mark { font-size: 10px; }
.eval-src {
  margin-top: 10px;
  font-size: 10.5px;
  color: var(--ink-3);
}
.eval-retry {
  margin-top: 10px;
  width: 100%;
  text-align: center;
  font-size: 13px; font-weight: 600;
  color: var(--accent-deep);
  background: var(--accent-soft);
  border-radius: var(--radius-pill);
  padding: 9px 0;
  cursor: pointer;
}
.eval-retry:active { opacity: .8; }

.pron-trend {
  margin-top: 12px;
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  padding: 9px 13px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
}
.pt-label { font-size: 11px; color: var(--ink-3); margin-right: 3px; }
.pt-val { font-size: 13px; font-weight: 700; color: var(--ink); }
.pt-arrow { font-size: 11px; color: var(--line-2); }

/* 录音浮层 */
.rec-mask {
  position: fixed; inset: 0;
  background: rgba(20, 21, 25, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 99;
}
.rec-card {
  position: relative;
  background: var(--surface);
  padding: 22px 26px 18px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  min-width: 270px;
  border-radius: var(--radius-l);
  box-shadow: var(--shadow-pop);
}
.rec-badge {
  position: absolute; top: -9px; right: 14px;
  font-size: 9px; font-weight: 800; letter-spacing: .1em;
  background: var(--danger); color: #fff;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  animation: blink 1.4s ease-in-out infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
.rec-hint {
  font-size: 14px; font-weight: 600;
  max-width: 250px;
  text-align: center;
  word-break: break-all;
}
.rec-sub {
  font-size: 12px; font-weight: 600;
  color: var(--accent-deep);
  background: var(--accent-soft);
  padding: 3px 11px;
  border-radius: var(--radius-pill);
}
.rec-stop {
  background: var(--ink);
  color: #fff;
  font-size: 14px; font-weight: 600;
  padding: 9px 26px;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.rec-stop:active { transform: scale(0.96); }
.rec-tip { font-size: 11px; color: var(--ink-3); }

/* ===== 课程列表 ===== */
.lessons { margin: 18px 14px 0; }
.lessons-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.refresh-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600;
  color: var(--ink-2);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: 5px 12px;
  cursor: pointer;
}
.refresh-btn:active { background: var(--surface-2); }
.rf-ico { width: 13px; height: 13px; }
.refresh-btn.is-spinning .rf-ico { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.cards-wrap { display: flex; flex-direction: column; gap: 10px; }
.lesson-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-l);
  padding: 14px 15px;
  cursor: pointer;
}
.lesson-card.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), var(--shadow-card);
}
.corner-lv {
  position: absolute; top: -1px; right: 14px;
  font-size: 9.5px; font-weight: 700;
  color: #fff;
  padding: 2px 8px;
  border-radius: 0 0 var(--radius-s) var(--radius-s);
}
.lv-easy { background: var(--ok); }
.lv-mid { background: var(--ink-3); }
.lv-hard { background: var(--danger); }
.score-badge {
  position: absolute; right: 15px; bottom: 11px;
  font-size: 10px; font-weight: 700;
  color: var(--ok);
  background: var(--ok-soft);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
}
.lc-head { display: flex; align-items: center; gap: 8px; }
.lc-title-group { flex: 1; min-width: 0; }
.lc-ko { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.lc-zh { font-size: 11.5px; color: var(--ink-3); margin-top: 1px; }
.lc-chv { width: 16px; height: 16px; color: var(--ink-3); flex: none; transition: transform .25s ease; }
.lc-chv.is-open { transform: rotate(180deg); }

.lc-detail {
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 9px;
}
.lcd-roman { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lcd-label {
  font-size: 10px; font-weight: 700;
  padding: 2px 8px;
  background: var(--surface-2);
  color: var(--ink-2);
  border-radius: var(--radius-pill);
}
.lcd-val { font-size: 13.5px; font-weight: 600; color: var(--accent-deep); }
.lcd-tip {
  padding: 8px 11px;
  background: var(--bg);
  border-radius: var(--radius-s);
  font-size: 12px; line-height: 1.65;
  color: var(--ink-2);
}
.lcd-actions { display: flex; align-items: center; gap: 8px; }
.lcd-go { margin-left: auto; }
</style>
