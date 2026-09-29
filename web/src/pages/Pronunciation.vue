<script setup>
// 发音跟读页（自小程序 pages/pronunciation 移植）：
// 内置 6 课 + AI 动态课程；标准音 TTS；按住跟读录音 → /api/pronounce ASR+AI 评分；趋势/我会了落库
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get, post, uploadFile } from '../api/client';
import { speak, stopSpeak } from '../api/tts';
import { loadCaps, getCaps } from '../api/caps';
import { currentUid, storeGet, storeRemove } from '../utils/storage';
import { createRecorder } from '../utils/recorder';
import { showToast } from '../utils/ui';

const router = useRouter();

const LESSONS = [
  { id: 'L1', level: '入门', emoji: '🅰️', text: '안녕하세요', zh: '你好 / 您好', roman: 'an-nyeong-ha-se-yo',
    tip: '五个音节慢慢读：안 녕 하 세 요。「세」轻轻咬住，「요」收尾上扬像问号。' },
  { id: 'L2', level: '入门', emoji: '👋', text: '안녕히 가세요', zh: '慢走（主人对客人说）', roman: 'an-nyeong-hi ga-se-yo',
    tip: '「히」要送气，嘴唇别太用力；结尾 세요 上扬。' },
  { id: 'L3', level: '日常', emoji: '🍲', text: '감사합니다', zh: '谢谢（最礼貌）', roman: 'gam-sa-ham-ni-da',
    tip: '收音「답」读 [m]，末尾读 ni-da，别读成「哈姆尼达」。' },
  { id: 'L4', level: '日常', emoji: '🍜', text: '주문할게요', zh: '我要点餐了', roman: 'ju-mun-hal-ge-yo',
    tip: '「할」ㄹ收音弹一下上齿龈；「게」读 ge 不读 kei。' },
  { id: 'L5', level: '进阶', emoji: '🎤', text: '사랑해요', zh: '我爱你', roman: 'sa-rang-hae-yo',
    tip: '两个 a 要清晰；랑해 之间 ㅎ 连读成 sa-rang-hae。' },
  { id: 'L6', level: '进阶', emoji: '✈️', text: '여권 좀 보여 주세요', zh: '请出示一下护照', roman: 'yeo-gwon jom bo-yeo ju-se-yo',
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
        if (refresh) showToast('新课程已生成 ✨');
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
  showToast('按住 🎤 再来一次', 1200);
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

// 聊天页「🎤 跟读」带入的 AI 回复句子 → 置为当前跟读目标
const practiceTarget = storeGet('kfp_practice_target');
if (practiceTarget) {
  storeRemove('kfp_practice_target');
  data.aiTarget = practiceTarget;
  data.pronOpen = true;
  data.lastEval = null;
  showToast('跟读目标已就位 🎤');
}
</script>

<template>
  <div class="page page-tab">
    <!-- ===== 顶部 Hero 卡 ===== -->
    <div class="hero pop pop-1">
      <div class="hero-inner">
        <div class="hero-text">
          <div class="hero-top"><span class="doodle-underline">발음</span> 연습 ✨</div>
          <div class="hero-mid">像韩国人一样读！</div>
          <div class="hero-sub">
            <div><span>🏆</span> 今日连续 {{ data.streak || 0 }} 天</div>
            <div><span>🎯</span> 已掌握 {{ data.mastered || 0 }} 条</div>
          </div>
        </div>
        <div class="vf stick-sm">
          <span class="vf-corner tl"></span>
          <span class="vf-corner tr"></span>
          <span class="vf-corner bl"></span>
          <span class="vf-corner br"></span>
          <div class="vf-target">🎯</div>
          <div class="vf-scan"></div>
          <div class="vf-tag">PRACTICE</div>
        </div>
      </div>
    </div>

    <!-- ===== K-pop 学歌入口 ===== -->
    <div class="song-entry pop pop-2" @click="router.push('/song')">
      <div class="se-left">
        <span class="se-ico">🎤</span>
        <div class="se-txt">
          <div class="se-t">K-pop 学歌</div>
          <div class="se-s">上传歌词 · AI 分句讲解 · 跟读评分</div>
        </div>
      </div>
      <span class="se-arrow">→</span>
    </div>

    <!-- ===== 练习区 ===== -->
    <div class="practice pop pop-2">
      <div class="practice-head">
        <span class="section-title">现在练习</span>
        <span class="tag tag-klein">{{ data.aiTarget ? '来自 AI 对话' : data.currentLesson.level }}</span>
      </div>

      <div class="pron-envelope">
        <div class="pron-main stick-sm" :class="{ open: data.pronOpen }" @click="data.pronOpen = !data.pronOpen">
          <div class="pm-row">
            <span class="pm-ico tag tag-cream">{{ data.aiTarget ? '🤖' : (data.currentLesson.emoji || '🗣️') }}</span>
            <div class="pm-text">
              <div class="pm-ko">{{ data.aiTarget || data.currentLesson.text }}</div>
              <div class="pm-zh">{{ data.aiTarget ? '跟读这句话，AI 会给你评分' : data.currentLesson.zh }}</div>
            </div>
            <div class="pm-chevron"><span>{{ data.pronOpen ? '⌃' : '⌄' }}</span></div>
          </div>
        </div>

        <!-- 展开：罗马音 / 提示 / 播放 / 跟读 -->
        <div v-if="data.pronOpen" class="pron-detail stick-sm">
          <span class="pd-tag">{{ data.aiTarget ? '跟读提示' : '罗马音 · Romanization' }}</span>
          <div v-if="!data.aiTarget" class="pd-romaji">{{ data.currentLesson.roman }}</div>
          <div class="pd-tip">
            <span class="tip-icon">💡</span>
            <span>{{ data.aiTarget ? '先点「听标准」听一遍，再按住跟读。AI 会按发音、语调给你评分。' : data.currentLesson.tip }}</span>
          </div>
          <div class="pd-row">
            <span class="btn-sm tag tag-klein" @click.stop="onPlay">🔊 听标准</span>
            <span
              class="btn-sm tag tag-honey"
              :class="{ 'rec-on': data.recording, evaluating: data.evaluating }"
              @mousedown.prevent="onRecStart"
              @mouseup.prevent="onRecEnd"
              @mouseleave="data.recording && onRecEnd()"
              @touchstart.prevent="onRecStart"
              @touchend.prevent="onRecEnd"
            >{{ data.evaluating ? '⏳ 评分中' : (data.recording ? '🔴 ' + data.recordTime + 's 松开结束' : '🎤 按住跟读') }}</span>
            <span class="btn-sm tag tag-mint pd-eval" @click.stop="onEval">✓ 我会了</span>
          </div>
        </div>
      </div>

      <!-- AI 评分反馈 -->
      <div v-if="data.lastEval" class="eval-card stick-sm">
        <div class="eval-head">
          <div class="eval-score">
            <span class="s-num">{{ data.lastEval.score || 0 }}</span>
            <span class="s-100">/100</span>
          </div>
          <span v-if="data.lastEval.score >= 90" class="eval-verdict tag tag-honey">完美 🌟</span>
          <span v-else-if="data.lastEval.score >= 70" class="eval-verdict tag tag-klein">不错 👍</span>
          <span v-else class="eval-verdict tag tag-coral">加油 💪</span>
        </div>
        <div v-if="data.lastEval.asr" class="eval-asr">🤖 AI 听到你说：{{ data.lastEval.asr }}</div>
        <div v-if="data.lastEval.advice" class="eval-tip">{{ data.lastEval.advice }}</div>
        <div v-if="data.lastEval.feedback && data.lastEval.feedback.length" class="eval-feedback">
          <span v-for="(f, fi) in data.lastEval.feedback" :key="fi" class="fb-chip" :class="f.ok ? 'ok' : 'bad'">
            <span class="fb-syl">{{ f.syl }}</span>
            <span class="fb-mark">{{ f.ok ? '✓' : 'x' }}</span>
          </span>
        </div>
        <!-- 评分依据透明化 + 再试一次 -->
        <span class="eval-src">{{ data.lastEval.src === 'fallback' ? '依据：ASR 相似度估算（AI 评分暂不可用）' : '依据：ASR 识别 + AI 发音评测' }}</span>
        <div v-if="data.lastEval.score < 85" class="eval-retry" @click="onRetryPron">🎤 再试一次，冲击更高分</div>
      </div>

      <!-- 最近评分趋势（真实落库数据） -->
      <div v-if="data.pronTrend.length >= 2" class="pron-trend">
        <span class="pt-label">最近评分</span>
        <template v-for="(v, vi) in data.pronTrend" :key="vi">
          <span class="pt-val">{{ v }}</span>
          <span v-if="vi < data.pronTrend.length - 1" class="pt-arrow">→</span>
        </template>
      </div>

      <!-- 录音浮层 -->
      <div v-if="data.recording" class="rec-mask">
        <div class="rec-card stick">
          <span class="rec-badge tag tag-coral">GO!</span>
          <div class="wavebars">
            <span class="bar b1"></span><span class="bar b2"></span><span class="bar b3"></span><span class="bar b4"></span>
            <span class="bar b5"></span><span class="bar b6"></span><span class="bar b7"></span>
          </div>
          <div class="rec-hint">读：{{ data.aiTarget || data.currentLesson.text }}</div>
          <div class="rec-sub">已录 {{ data.recordTime }}s / 30s</div>
          <div class="rec-stop" @click="onRecEnd">⏹ 结束并评分</div>
          <div class="rec-tip">松开 🎤 或点上方按钮结束</div>
        </div>
      </div>
    </div>

    <!-- ===== 课程列表 ===== -->
    <div class="lessons pop pop-3">
      <div class="lessons-head">
        <span class="section-title">AI 为你定制的课程</span>
        <span class="refresh-btn" :class="{ spinning: data.refreshing }" @click="onRefreshLessons">🔄 换一批</span>
      </div>

      <!-- 骨架屏 -->
      <div v-if="data.lessonsLoading && !data.lessons.length" class="cards-wrap">
        <div v-for="i in 3" :key="i" class="lesson-card skeleton-card">
          <div class="sk-line sk-line-title"></div>
          <div class="sk-line sk-line-sub"></div>
        </div>
      </div>

      <div v-else class="cards-wrap">
        <div v-for="(lesson, i) in data.lessons" :key="lesson.id" class="lesson-card"
          :class="{ 'card-active': i === data.currentIndex, 'card-open': data.openIndex === i }"
          @click="onCardTap(i)"
        >
          <span class="corner-lv" :class="levelClass(lesson.level)">{{ lesson.level }}</span>
          <span class="pin"></span>
          <span v-if="data.evalScores[lesson.text]" class="score-badge">{{ data.evalScores[lesson.text] }}分</span>

          <div class="lc-head">
            <span class="lc-emoji tag tag-cream">{{ lesson.emoji || '📒' }}</span>
            <div class="lc-title-group">
              <div class="lc-ko">{{ lesson.text }}</div>
              <div class="lc-zh">{{ lesson.zh }}</div>
            </div>
            <span class="lc-chv">{{ data.openIndex === i ? '⌃' : '⌄' }}</span>
          </div>

          <div v-if="data.openIndex === i" class="lc-detail">
            <div class="lcd-romaji">
              <span class="lcd-label">罗马音</span>
              <span class="lcd-val">{{ lesson.roman }}</span>
            </div>
            <div class="lcd-tip">
              <span class="tip-icon">💡</span>
              <span>{{ lesson.tip }}</span>
            </div>
            <div class="lcd-actions">
              <span class="btn-sm tag tag-klein" @click.stop="onCardPlay(lesson)">🔊 听</span>
              <span class="btn-sm tag tag-coral lcd-go" @click.stop="onCardGo(i)">🎯 练它</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 10px 0 calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px);
  position: relative;
}

/* ===== Hero 卡 ===== */
.hero {
  margin: 14px 14px 11px;
  padding: 14px 13px 15px;
  background:
    radial-gradient(circle at 115% -10%, rgba(255, 210, 94, 0.4) 0%, transparent 55%),
    radial-gradient(circle at -10% 110%, rgba(110, 211, 196, 0.28) 0%, transparent 55%),
    #fff;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sticker);
  position: relative;
  overflow: hidden;
}
.hero-inner { display: flex; align-items: stretch; gap: 9px; position: relative; z-index: 1; }
.hero-text { flex: 1; min-width: 0; }
.hero-top { font-size: 16px; font-weight: 900; color: var(--c-ink); letter-spacing: 0.5px; }
.hero-mid {
  font-size: 20px; font-weight: 900;
  margin: 4px 0 7px;
  letter-spacing: 0.5px;
  background: linear-gradient(120deg, var(--c-klein-deep), var(--c-mint), var(--c-klein-deep));
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: grad-shift 8s linear infinite;
}
.hero-sub { display: flex; flex-direction: column; gap: 4px; }
.hero-sub div { font-size: 12px; font-weight: 700; color: var(--c-ink-soft); display: inline-flex; align-items: center; gap: 4px; }
.hero-sub span { font-size: 13px; }

/* 取景器 */
.vf {
  width: 85px; height: 85px;
  background: linear-gradient(135deg, var(--c-sky-mist), var(--c-sky-soft));
  border-radius: 12px;
  position: relative; flex-shrink: 0; overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.15);
}
.vf-corner { position: absolute; width: 14px; height: 14px; border: 2px solid var(--c-ink); }
.vf-corner.tl { top: 7px; left: 7px; border-right: none; border-bottom: none; }
.vf-corner.tr { top: 7px; right: 7px; border-left: none; border-bottom: none; }
.vf-corner.bl { bottom: 7px; left: 7px; border-right: none; border-top: none; }
.vf-corner.br { bottom: 7px; right: 7px; border-left: none; border-top: none; }
.vf-target {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 30px;
  animation: target-bob 2.2s ease-in-out infinite;
}
@keyframes target-bob {
  0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
  50% { transform: translateY(-4px) rotate(-6deg) scale(1.05); }
}
.vf-scan {
  position: absolute; left: 10%; right: 10%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--c-coral), transparent);
  box-shadow: 0 0 8px var(--c-coral);
  animation: scan 2s ease-in-out infinite;
}
@keyframes scan {
  0% { top: 15%; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { top: 85%; opacity: 0; }
}
.vf-tag {
  position: absolute; bottom: 5px; right: 5px;
  font-size: 8px; font-weight: 900; letter-spacing: 0.5px;
  padding: 1.5px 5px;
  background: var(--c-ink); color: #fff;
  border-radius: 3px;
  transform: rotate(-4deg);
}

/* ===== 学歌入口 ===== */
.song-entry {
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 12px 14px;
  padding: 13px 14px;
  background: var(--c-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sticker);
  cursor: pointer;
}
.song-entry:active { transform: scale(0.97); }
.se-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.se-ico { font-size: 22px; }
.se-t { font-size: 14.5px; font-weight: 800; color: var(--c-ink); }
.se-s { margin-top: 2px; font-size: 11px; color: var(--c-mute); }
.se-arrow { font-size: 15px; color: var(--c-klein); font-weight: 700; }

/* ===== 练习区 ===== */
.practice {
  margin: 7px 14px 10px;
  padding: 12px 11px 11px;
  background: #fff;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sticker);
}
.practice-head, .lessons-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 9px;
}
.section-title {
  font-size: 15px; font-weight: 900; color: var(--c-ink);
  position: relative; display: inline-block;
}
.section-title::after {
  content: "";
  position: absolute; left: 0; bottom: -2px;
  width: 30%; height: 3px;
  background: var(--c-klein);
  border-radius: 999px;
}

.pron-envelope { position: relative; }
.pron-main {
  background: linear-gradient(135deg, var(--c-sky-soft) 0%, #FFFFFF 100%);
  padding: 10px;
  border-radius: 10px;
  position: relative;
}
.pm-row { display: flex; align-items: center; gap: 7px; }
.pm-ico {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; padding: 0 !important;
  border-radius: 10px;
}
.pm-text { flex: 1; min-width: 0; }
.pm-ko { font-size: 19px; font-weight: 900; color: var(--c-klein-deep); letter-spacing: 0.5px; }
.pm-zh { font-size: 12px; color: var(--c-ink-soft); margin-top: 2px; font-weight: 700; }
.pm-chevron {
  width: 30px; height: 30px;
  border-radius: 9px; background: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 900; color: var(--c-klein);
  box-shadow: var(--shadow-sticker);
  flex: none;
}
.pron-main.open .pm-chevron { transform: rotate(180deg); background: var(--c-klein); color: #fff; }

.pron-detail {
  margin-top: -5px;
  padding: 14px 11px 11px;
  padding-top: 18px;
  background: #fff;
  border-radius: 0 0 10px 10px;
  border-top: none;
  display: flex; flex-direction: column; gap: 8px;
}
.pd-tag {
  align-self: flex-start;
  font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
  padding: 2px 8px;
  background: var(--c-honey); color: var(--c-ink);
  border-radius: 999px;
}
.pd-romaji {
  font-size: 15px; font-weight: 800; color: var(--c-klein);
  letter-spacing: 0.5px;
  padding: 5px 8px;
  background: var(--c-cream);
  border-radius: 7px;
  border: 1px dashed rgba(14,24,54,0.18);
}
.pd-tip {
  display: flex; align-items: flex-start; gap: 5px;
  padding: 7px 8px;
  background: #F7FFD1;
  border-radius: 9px;
  font-size: 13px; line-height: 1.6; color: var(--c-ink); font-weight: 600;
}
.tip-icon { font-size: 15px; flex-shrink: 0; }

.pd-row { display: flex; align-items: center; gap: 6px; margin-top: 2px; flex-wrap: wrap; user-select: none; }
.btn-sm {
  padding: 6px 11px !important;
  font-size: 13px !important;
  font-weight: 800 !important;
  border-radius: 9px !important;
  cursor: pointer;
  touch-action: none;
}
.btn-sm:active { transform: scale(0.92); }
.pd-eval { margin-left: auto; }

.rec-on {
  background: linear-gradient(135deg, var(--c-coral), #FF8A5C) !important;
  color: #fff !important;
  animation: rec-on-pulse 1.2s ease-in-out infinite;
}
@keyframes rec-on-pulse {
  0%, 100% { box-shadow: 0 2px 7px rgba(255, 59, 48, 0.3); }
  50% { box-shadow: 0 3px 10px rgba(255, 59, 48, 0.55); }
}

/* 评估卡 */
.eval-card {
  margin-top: 10px;
  padding: 11px;
  background: radial-gradient(circle at 0% 0%, rgba(110,211,196,0.28) 0%, transparent 60%), #fff;
  animation: eval-in 0.5s ease-out;
}
@keyframes eval-in {
  0% { opacity: 0; transform: translateY(-6px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.eval-head { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; }
.eval-score { display: flex; align-items: baseline; }
.s-num {
  font-size: 32px; font-weight: 900;
  background: linear-gradient(180deg, var(--c-klein-deep), var(--c-klein));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.s-100 { font-size: 11px; font-weight: 800; color: var(--c-mute); margin-left: 3px; }
.eval-verdict { padding: 3px 11px !important; font-size: 12px !important; margin-left: auto; }
.eval-asr {
  font-size: 12px; color: var(--c-klein-deep);
  background: var(--c-sky-soft);
  border: 1px dashed var(--c-border);
  border-radius: 6px;
  padding: 5px 8px;
  margin-top: 7px;
}
.eval-tip {
  font-size: 13px; font-weight: 700; line-height: 1.7; color: var(--c-ink);
  padding: 6px 8px;
  background: var(--c-cream);
  border-radius: 7px;
  border: 1px dashed rgba(14,24,54,0.18);
  margin-bottom: 7px;
}
.eval-feedback { display: flex; flex-wrap: wrap; gap: 5px; }
.fb-chip {
  display: flex; align-items: center; gap: 3px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px; font-weight: 800;
}
.fb-chip.ok { background: #D7F5EC; color: #0E836E; }
.fb-chip.bad { background: #FFE0EA; color: #C22A5A; }
.fb-mark { font-size: 11px; margin-left: 1px; }

.eval-src {
  margin-top: 7px;
  font-size: 10px; color: var(--c-mute);
  background: #F7F8FA;
  border-radius: 6px;
  padding: 4px 8px;
  display: inline-block;
}
.eval-retry {
  margin-top: 9px;
  text-align: center;
  font-size: 13px; font-weight: 700;
  color: var(--c-klein-deep);
  background: var(--c-sky-mist);
  border-radius: 999px;
  padding: 9px 0;
  cursor: pointer;
}
.eval-retry:active { transform: scale(0.97); opacity: 0.85; }

.pron-trend {
  margin-top: 10px;
  display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
  background: #fff;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  padding: 8px 11px;
}
.pt-label { font-size: 11px; color: var(--c-mute); margin-right: 4px; }
.pt-val { font-size: 13px; font-weight: 700; color: var(--c-klein-deep); }
.pt-arrow { font-size: 11px; color: #C7C7CC; }

/* 录音浮层 */
.rec-mask {
  position: fixed; inset: 0;
  background: rgba(14, 24, 54, 0.55);
  backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center;
  z-index: 99;
}
.rec-card {
  background: radial-gradient(circle at 100% 0%, rgba(12,93,255,0.2) 0%, transparent 55%), #fff;
  padding: 20px 25px 16px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  min-width: 270px;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lift);
}
.rec-badge {
  position: absolute; top: -11px; left: -5px;
  transform: rotate(-6deg);
  padding: 3px 11px !important;
  box-shadow: 0 0 0 2px rgba(255, 59, 48, 0.2);
  animation: badge-pulse 1.5s ease-in-out infinite;
}
.rec-hint {
  font-size: 14px; font-weight: 800; color: var(--c-ink);
  padding: 4px 9px;
  background: var(--c-sky-soft);
  border-radius: 7px;
  border: 1px dashed rgba(14,24,54,0.2);
  max-width: 245px;
  text-align: center;
}
.rec-sub {
  font-size: 12px; font-weight: 700;
  background: var(--c-coral); color: #fff;
  padding: 3px 11px; border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.rec-stop {
  margin-top: 3px;
  background: linear-gradient(135deg, var(--c-klein), var(--c-klein-deep));
  color: #fff; font-size: 14px; font-weight: 800;
  padding: 9px 24px; border-radius: 999px;
  cursor: pointer;
}
.rec-stop:active { transform: scale(0.94); }
.rec-tip { font-size: 11px; color: var(--c-mute); }

/* ===== 课程列表 ===== */
.lessons { margin: 5px 14px 0; }
.cards-wrap { display: flex; flex-direction: column; gap: 10px; }
.lesson-card {
  background: #fff;
  padding: 11px;
  position: relative;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sticker);
  cursor: pointer;
}
.card-active {
  background: radial-gradient(circle at 100% 0%, rgba(255,210,94,0.35) 0%, transparent 55%), #FFF;
  box-shadow: 0 5px 14px rgba(255, 200, 50, 0.18), 0 0 0 1px rgba(255, 210, 94, 0.5);
}
.corner-lv {
  position: absolute; top: -8px; right: -4px;
  transform: rotate(6deg);
  padding: 2px 9px !important;
  font-size: 10px !important;
  color: #fff !important;
  z-index: 2;
}
.lv-easy { background: var(--c-mint); color: #033F39; }
.lv-mid  { background: var(--c-klein); color: #fff; }
.lv-hard { background: var(--c-coral); color: #fff; }
.pin {
  position: absolute; top: -5px; left: 15px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff 0%, var(--c-coral) 30%, #C22A5A 100%);
  z-index: 2;
}
.score-badge {
  position: absolute; right: 9px; bottom: 7px;
  font-size: 10px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, var(--c-mint), #14B8A6);
  border-radius: 999px;
  padding: 2px 8px;
}
.lc-head { display: flex; align-items: center; gap: 7px; }
.lc-emoji {
  width: 34px; height: 34px;
  padding: 0 !important;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; border-radius: 10px; flex-shrink: 0;
}
.lc-title-group { flex: 1; min-width: 0; }
.lc-ko { font-size: 16px; font-weight: 900; color: var(--c-ink); letter-spacing: 0.3px; }
.lc-zh { font-size: 11px; color: var(--c-ink-soft); font-weight: 700; margin-top: 1px; }
.lc-chv {
  font-size: 14px; font-weight: 900; color: var(--c-klein);
  width: 26px; height: 26px;
  border-radius: 8px;
  background: var(--c-sky-soft);
  display: flex; align-items: center; justify-content: center;
  flex: none;
}
.card-open .lc-chv { transform: rotate(180deg); background: var(--c-klein); color: #fff; }

.lc-detail {
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px dashed rgba(14, 24, 54, 0.18);
  display: flex; flex-direction: column; gap: 7px;
}
.lcd-romaji { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.lcd-label {
  font-size: 10px; font-weight: 800;
  padding: 2px 7px;
  background: var(--c-honey); color: var(--c-ink);
  border-radius: 999px; letter-spacing: 0.5px;
}
.lcd-val { font-size: 14px; font-weight: 800; color: var(--c-klein); letter-spacing: 0.5px; }
.lcd-tip {
  padding: 6px 8px;
  background: #F7FFD1;
  border-radius: 8px;
  font-size: 12px; font-weight: 600; color: var(--c-ink);
  line-height: 1.65;
  display: flex; gap: 5px;
}
.lcd-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.lcd-go { margin-left: auto; }

.refresh-btn {
  font-size: 12px; color: var(--c-klein);
  background: var(--c-sky-soft);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  padding: 4px 11px;
  font-weight: 700;
  cursor: pointer;
}
.refresh-btn:active { transform: scale(0.9); background: var(--c-klein); color: #fff; }
.refresh-btn.spinning { opacity: 0.7; animation: spin-slow 1s linear infinite; }

.skeleton-card { padding: 15px 14px; }
.sk-line-title { height: 17px; width: 60%; margin-bottom: 8px; background: linear-gradient(90deg, #E8F1F8 25%, #F4F9FD 50%, #E8F1F8 75%); background-size: 400% 100%; animation: shimmer-move 1.4s ease infinite; }
.sk-line-sub { height: 12px; width: 85%; background: linear-gradient(90deg, #E8F1F8 25%, #F4F9FD 50%, #E8F1F8 75%); background-size: 400% 100%; animation: shimmer-move 1.4s ease infinite; }
</style>
