<script setup>
// 韩剧名句页（自小程序 pages/quotes 移植）：
// 每日金句轮播 + 主题/剧集/难度筛选 + 分页加载 + 收藏 + TTS + 跟读 + 问 AI + AI 换一批 + 分享卡
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../api/client';
import { speak } from '../api/tts';
import { currentUid, storeGet, storeSet } from '../utils/storage';
import { QUOTES, dailyQuote, THEMES, LEVELS, DRAMAS } from '../data/quotes-data';
import { shareQuoteCard } from '../utils/quoteCard';
import { showToast } from '../utils/ui';

const router = useRouter();

const PAGE_SIZE = 8;

function favKey() {
  return 'kfp_fav_quotes_' + (currentUid() || 'guest');
}

function loadFavs() {
  return storeGet(favKey(), {}) || {};
}

function normalizeQuote(quote) {
  const colors = Array.isArray(quote && quote.color) && quote.color.length >= 2
    ? quote.color.slice(0, 2)
    : ['#E8DFC8', '#D9C9A3'];
  return { ...(quote || {}), color: colors };
}

const data = reactive({
  heroIndex: 0,
  themes: ['全部'].concat(THEMES),
  dramas: ['全部'].concat(DRAMAS),
  levels: ['全部'].concat(LEVELS),
  filter: { theme: '全部', drama: '全部', level: '全部' },
  favOnly: false,
  quotes: [],
  total: 0,
  hasMore: false,
  favs: {},
  aiLoading: false
});

let all = QUOTES.map(normalizeQuote);
let filtered = [];
let shown = 0;
const heroQuotes = ref([]);

const daily = dailyQuote();
heroQuotes.value = [daily].concat(
  all.filter((q) => q.id !== daily.id && q.drama !== '韩剧通用').slice(0, 4)
);

/* ===== 每日金句轮播（5s 自动轮播 + 圆点可点） ===== */
let heroTimer = null;
function startHeroTimer() {
  stopHeroTimer();
  heroTimer = setInterval(() => {
    data.heroIndex = (data.heroIndex + 1) % heroQuotes.value.length;
  }, 5000);
}
function stopHeroTimer() {
  if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
}
function onHeroDot(i) {
  data.heroIndex = i;
  startHeroTimer();
}
onMounted(startHeroTimer);
onBeforeUnmount(stopHeroTimer);

/* ---------------- 筛选 ---------------- */
function onFilterTap(kind, value) {
  data.filter = { ...data.filter, [kind]: value };
  data.favOnly = false;
  apply();
}

function onFavFilterTap() {
  data.favOnly = !data.favOnly;
  apply();
}

function apply() {
  const { filter, favOnly, favs } = data;
  filtered = all.filter((q) => {
    if (filter.theme !== '全部' && q.theme !== filter.theme) return false;
    if (filter.drama !== '全部' && q.drama !== filter.drama) return false;
    if (filter.level !== '全部' && q.level !== filter.level) return false;
    if (favOnly && !favs[q.id]) return false;
    return true;
  });
  shown = Math.min(PAGE_SIZE, filtered.length);
  render();
}

function render() {
  const favs = data.favs;
  data.quotes = filtered.slice(0, shown).map((q) => ({ ...q, isFav: !!favs[q.id] }));
  data.total = filtered.length;
  data.hasMore = shown < filtered.length;
}

/* 分页加载：IntersectionObserver 监听哨兵元素（等价 onReachBottom） */
const sentinel = ref(null);
let observer = null;
onMounted(() => {
  data.favs = loadFavs();
  apply();
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && data.hasMore) {
      shown += PAGE_SIZE;
      render();
    }
  });
  if (sentinel.value) observer.observe(sentinel.value);
});
onBeforeUnmount(() => observer && observer.disconnect());

/* ---------------- 每卡操作 ---------------- */
function findQuote(id) {
  return all.find((q) => q.id === id) || data.quotes.find((q) => q.id === id);
}

function onSpeakTap(id) {
  const q = findQuote(id);
  if (q) speak(q.ko).then((ok) => {
    if (!ok) showToast('TTS 未就绪，暂无声音');
  });
}

function onFavTap(id) {
  const q = findQuote(id);
  if (!q) return;
  const favs = loadFavs();
  if (favs[id]) delete favs[id];
  else favs[id] = q;
  storeSet(favKey(), favs);
  data.favs = favs;
  render();
}

function onFollowTap(id) {
  const q = findQuote(id);
  if (!q) return;
  storeSet('kfp_practice_target', q.ko);
  router.push('/pronunciation');
}

function onAskTap(id) {
  const q = findQuote(id);
  if (!q) return;
  storeSet('kfp_chat_prefill',
    `韩剧《${q.drama}》台词「${q.ko}」（${q.zh}）这句话怎么理解？帮我逐句讲解语法和发音要点`);
  router.push('/chat');
}

async function onShareImgTap(id) {
  const q = findQuote(id);
  if (!q) return;
  showToast('生成卡片…', 60000);
  const ok = await shareQuoteCard(q);
  if (!ok) showToast('生成失败');
}

/* ---------------- AI 生成换一批 ---------------- */
function onAiGenerate() {
  if (data.aiLoading) return;
  data.aiLoading = true;
  const { filter } = data;
  post('/api/quotes/generate', {
    userId: currentUid(),
    drama: filter.drama === '全部' ? '' : filter.drama,
    theme: filter.theme === '全部' ? '' : filter.theme,
    level: filter.level === '全部' ? '' : filter.level,
    refresh: true
  })
    .then((res) => {
      data.aiLoading = false;
      if (res && res.quotes && res.quotes.length) {
        all = res.quotes.map(normalizeQuote).concat(all);
        data.filter = { theme: '全部', drama: '全部', level: '全部' };
        data.favOnly = false;
        apply();
        showToast('新台词已生成');
      } else {
        showToast((res && res.error) || '生成失败，请重试');
      }
    })
    .catch(() => {
      data.aiLoading = false;
      showToast('生成失败，请确认后端已启动');
    });
}

/* ---------------- 转化 CTA ---------------- */
function onGoChat() {
  storeSet('kfp_chat_prefill', '我想系统学习韩语，请根据我的水平制定学习建议');
  router.push('/chat');
}
</script>

<template>
  <div class="page page-tab">
    <!-- ===== Hero：每日金句轮播 ===== -->
    <div class="hero rise rise-1">
      <div class="hero-viewport">
        <div
          v-for="(item, index) in heroQuotes"
          v-show="index === data.heroIndex"
          :key="item.id"
          class="hero-card"
          :style="{ background: `linear-gradient(135deg, ${item.color[0]}, ${item.color[1]})` }"
        >
          <div class="hero-top">
            <span v-if="index === 0" class="hero-badge">오늘의 명대사</span>
            <span class="hero-drama">{{ item.drama }}<template v-if="item.year"> · {{ item.year }}</template></span>
          </div>
          <div class="hero-ko">{{ item.ko }}</div>
          <div class="hero-roman num">{{ item.roman }}</div>
          <div class="hero-zh">{{ item.zh }}</div>
          <button class="hero-speaker" @click="onSpeakTap(item.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 6.5 9H3.5v6h3L11 18.5v-13Z" /><path d="M15 9.5a3.5 3.5 0 0 1 0 5" /></svg>
            听发音
          </button>
        </div>
      </div>
      <div class="hero-dots">
        <span
          v-for="(item, index) in heroQuotes"
          :key="index"
          class="hd"
          :class="{ 'hd-on': index === data.heroIndex }"
          @click="onHeroDot(index)"
        ></span>
      </div>
    </div>

    <!-- ===== 筛选区 ===== -->
    <div class="filters rise rise-2">
      <div class="filter-row">
        <button
          v-for="t in data.themes"
          :key="t"
          class="ftag"
          :class="{ 'is-on': data.filter.theme === t }"
          @click="onFilterTap('theme', t)"
        >{{ t === '全部' ? '全部主题' : t }}</button>
      </div>
      <div class="filter-row">
        <button
          v-for="d in data.dramas"
          :key="d"
          class="ftag"
          :class="{ 'is-on': data.filter.drama === d }"
          @click="onFilterTap('drama', d)"
        >{{ d === '全部' ? '全部剧集' : d }}</button>
      </div>
      <div class="filter-row">
        <button
          v-for="l in data.levels"
          :key="l"
          class="ftag"
          :class="{ 'is-on': data.filter.level === l }"
          @click="onFilterTap('level', l)"
        >{{ l === '全部' ? '全部难度' : l }}</button>
      </div>
      <div class="filter-row">
        <button class="ftag" :class="{ 'is-on': data.favOnly }" @click="onFavFilterTap">我的收藏</button>
        <button class="ftag ftag-ai" :class="{ 'is-loading': data.aiLoading }" @click="onAiGenerate">{{ data.aiLoading ? '生成中…' : 'AI 换一批' }}</button>
      </div>
    </div>

    <!-- ===== 名句卡片流 ===== -->
    <div class="cards">
      <div v-for="item in data.quotes" :key="item.id" class="qcard rise">
        <div class="q-top">
          <span class="q-drama">{{ item.drama }}</span>
          <span class="q-level">{{ item.level }} · {{ item.theme }}</span>
        </div>

        <div class="q-ko">{{ item.ko }}</div>

        <button class="q-roman" @click="onSpeakTap(item.id)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 6.5 9H3.5v6h3L11 18.5v-13Z" /><path d="M15 9.5a3.5 3.5 0 0 1 0 5" /></svg>
          <span class="num">{{ item.roman }}</span>
        </button>

        <div class="q-zh">{{ item.zh }}</div>

        <div v-if="item.grammar" class="q-grammar">{{ item.grammar }}</div>

        <div v-if="item.vocab && item.vocab.length" class="q-vocab">
          <span v-for="v in item.vocab" :key="v.ko" class="v-chip">{{ v.ko }} · {{ v.zh }}</span>
        </div>

        <div v-if="item.similar && item.similar.length" class="q-similar">
          <span class="s-label">相似表达</span>
          <span v-for="sm in item.similar" :key="sm" class="s-item">{{ sm }}</span>
        </div>

        <div class="q-ops">
          <button class="opb" :class="{ 'is-fav': item.isFav }" @click="onFavTap(item.id)">{{ item.isFav ? '已收藏' : '收藏' }}</button>
          <button class="opb" @click="onFollowTap(item.id)">跟读</button>
          <button class="opb" @click="onAskTap(item.id)">问 AI</button>
          <button class="opb" @click="onShareImgTap(item.id)">分享卡</button>
        </div>
      </div>

      <div ref="sentinel" class="list-end" v-if="data.quotes.length">{{ data.hasMore ? '上滑加载更多' : '到底啦，点上方 AI 换一批' }}</div>
      <div class="empty" v-if="!data.quotes.length">该筛选下暂无名句，换个筛选或点 AI 生成</div>
    </div>

    <!-- ===== 转化 CTA ===== -->
    <button class="cta rise" @click="onGoChat">
      <span class="cta-text">
        <span class="cta-title">想系统学韩语？</span>
        <span class="cta-sub">去对话页，让 AI 老师带你练这句话</span>
      </span>
      <svg class="cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </button>
  </div>
</template>

<style scoped>
/* ===== Hero 轮播 ===== */
.hero { padding: 4px 14px 0; }
.hero-viewport { position: relative; min-height: 196px; }
.hero-card {
  position: absolute; inset: 0;
  border-radius: var(--radius-l);
  padding: 18px 20px;
  color: #fff;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  justify-content: center;
  animation: hero-fade .45s ease-out;
}
@keyframes hero-fade {
  from { opacity: 0; transform: scale(0.99); }
  to { opacity: 1; transform: scale(1); }
}
.hero-top { display: flex; align-items: center; gap: 8px; }
.hero-badge {
  font-size: 9.5px; font-weight: 800; letter-spacing: .08em;
  background: rgba(255, 255, 255, 0.22);
  padding: 2px 9px;
  border-radius: var(--radius-pill);
}
.hero-drama { font-size: 11.5px; font-weight: 600; opacity: .88; }
.hero-ko {
  margin-top: 12px;
  font-size: 21px; font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.4;
  text-shadow: 0 1px 3px rgba(0,0,0,0.10);
}
.hero-roman { margin-top: 6px; font-size: 11.5px; opacity: .88; }
.hero-zh { margin-top: 3px; font-size: 12.5px; opacity: .92; }
.hero-speaker {
  margin-top: 14px;
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
  padding: 5px 13px;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.hero-speaker:active { background: rgba(255, 255, 255, 0.32); }
.hero-speaker svg { width: 13px; height: 13px; }
.hero-dots { display: flex; justify-content: center; gap: 6px; padding: 11px 0 2px; }
.hd { width: 5px; height: 5px; border-radius: 50%; background: var(--line-2); transition: all .25s ease; cursor: pointer; }
.hd-on { background: var(--ink); width: 15px; border-radius: var(--radius-pill); }

/* ===== 筛选 ===== */
.filters { padding: 8px 14px 0; display: flex; flex-direction: column; gap: 6px; }
.filter-row {
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 2px 0;
}
.filter-row::-webkit-scrollbar { display: none; }
.ftag {
  flex: none;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: transparent;
  border: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all .18s ease;
}
.ftag:active { transform: scale(0.96); }
.ftag.is-on { background: var(--ink); color: #fff; border-color: var(--ink); font-weight: 600; }
.ftag-ai { color: var(--accent-deep); border-color: rgba(169, 120, 61, 0.35); background: var(--accent-soft); }
.ftag-ai.is-loading { opacity: .6; }

/* ===== 名句卡片流 ===== */
.cards { padding: 10px 14px 0; }
.qcard {
  border-radius: var(--radius-l);
  padding: 15px 17px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
  margin-bottom: 10px;
}
.q-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.q-drama {
  font-size: 10.5px; font-weight: 700;
  color: var(--accent-deep);
  background: var(--accent-soft);
  padding: 2px 9px;
  border-radius: var(--radius-pill);
}
.q-level { font-size: 10.5px; color: var(--ink-3); }
.q-ko { margin-top: 11px; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); line-height: 1.5; user-select: text; }
.q-roman {
  margin-top: 8px;
  display: flex; align-items: center; gap: 5px;
  font-size: 12.5px; color: var(--ink-3);
  cursor: pointer;
  user-select: text;
}
.q-roman:active { color: var(--accent-deep); }
.q-roman svg { width: 13px; height: 13px; flex: none; }
.q-zh { margin-top: 5px; font-size: 13.5px; color: var(--ink-2); user-select: text; }
.q-grammar {
  margin-top: 10px;
  padding: 8px 11px;
  background: var(--bg);
  border-left: 3px solid var(--line-2);
  border-radius: 0 var(--radius-s) var(--radius-s) 0;
  font-size: 12px; line-height: 1.6;
  color: var(--ink-2);
  user-select: text;
}
.q-vocab { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.v-chip {
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  font-size: 11px;
  color: var(--ink-2);
}
.q-similar { margin-top: 8px; font-size: 11.5px; color: var(--ink-3); line-height: 1.8; }
.s-label { font-weight: 600; margin-right: 6px; }
.s-item { margin-right: 8px; }

.q-ops {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--line);
  display: flex; gap: 7px;
}
.opb {
  padding: 5px 13px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 12px; font-weight: 500;
  color: var(--ink-2);
  cursor: pointer;
  transition: all .15s ease;
}
.opb:active { background: var(--surface-2); }
.opb.is-fav { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 600; }

.list-end { text-align: center; font-size: 11px; color: var(--ink-3); padding: 14px 0 4px; }
.empty { text-align: center; font-size: 13px; color: var(--ink-3); padding: 36px 0; }

/* ===== 转化 CTA ===== */
.cta {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin: 14px 14px 0;
  padding: 15px 18px;
  background: var(--ink);
  border-radius: var(--radius-l);
  color: #fff;
  cursor: pointer;
  text-align: left;
}
.cta-text { display: flex; flex-direction: column; gap: 2px; }
.cta-title { font-size: 14.5px; font-weight: 700; }
.cta-sub { font-size: 11.5px; color: #B9BFC8; }
.cta-arrow { width: 18px; height: 18px; flex: none; color: #B9BFC8; }
</style>
