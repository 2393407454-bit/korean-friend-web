<script setup>
// 韩剧名句页（自小程序 pages/quotes 移植）：
// 每日金句轮播 + 主题/剧集/难度筛选 + 分页加载 + 收藏 + TTS + 跟读 + 问 AI + AI 换一批 + 分享卡
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
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
    : ['#EAF3FF', '#DCEAFF'];
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

/* ===== 每日金句轮播（swiper 等价物：5s 自动轮播 + 圆点可点） ===== */
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
        showToast('新台词已生成 ✨');
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
    <div class="hero-wrap pop pop-1">
      <div class="hero-viewport">
        <div
          v-for="(item, index) in heroQuotes"
          v-show="index === data.heroIndex"
          :key="item.id"
          class="hero-card"
          :style="{ background: `linear-gradient(135deg, ${item.color[0]}, ${item.color[1]})` }"
        >
          <div v-if="index === 0" class="hero-badge">🌟 오늘의 명대사 · 今日名句</div>
          <div class="hero-drama">📺 {{ item.drama }}<span v-if="item.year"> · {{ item.year }}</span></div>
          <div class="hero-ko">{{ item.ko }}</div>
          <div class="hero-roman">{{ item.roman }}</div>
          <div class="hero-zh">{{ item.zh }}</div>
          <div class="hero-speaker" @click="onSpeakTap(item.id)">🔊 听发音</div>
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
    <div class="filters pop pop-2">
      <div class="filter-row">
        <span
          v-for="t in data.themes"
          :key="t"
          class="ftag"
          :class="{ 'ftag-on': data.filter.theme === t }"
          @click="onFilterTap('theme', t)"
        >{{ t === '全部' ? '🎭 主题' : t }}</span>
      </div>
      <div class="filter-row">
        <span
          v-for="d in data.dramas"
          :key="d"
          class="ftag"
          :class="{ 'ftag-on': data.filter.drama === d }"
          @click="onFilterTap('drama', d)"
        >{{ d === '全部' ? '📺 全部剧集' : d }}</span>
      </div>
      <div class="filter-row filter-row-last">
        <span
          v-for="l in data.levels"
          :key="l"
          class="ftag"
          :class="{ 'ftag-on': data.filter.level === l }"
          @click="onFilterTap('level', l)"
        >{{ l === '全部' ? '📊 全部难度' : l }}</span>
        <span class="ftag ftag-fav" :class="{ 'ftag-on': data.favOnly }" @click="onFavFilterTap">⭐ 我的收藏</span>
        <span class="ftag ftag-ai" :class="{ loading: data.aiLoading }" @click="onAiGenerate">{{ data.aiLoading ? '✨ 生成中…' : '✨ AI 换一批' }}</span>
      </div>
    </div>

    <!-- ===== 名句卡片流 ===== -->
    <div class="cards">
      <div v-for="item in data.quotes" :key="item.id" class="qcard-outer">
        <div class="qcard" :style="{ background: `linear-gradient(160deg, ${item.color[0]}14, ${item.color[1]}0D)` }">
          <div class="q-top">
            <span class="q-drama tag tag-klein">📺 {{ item.drama }}</span>
            <span class="q-level tag tag-paper">{{ item.level }} · {{ item.theme }}</span>
          </div>

          <div class="q-ko" user-select>{{ item.ko }}</div>

          <div class="q-roman" @click="onSpeakTap(item.id)">
            <span class="q-roman-icon">🔊</span>
            <span>{{ item.roman }}</span>
          </div>

          <div class="q-zh">{{ item.zh }}</div>

          <div v-if="item.grammar" class="q-grammar">
            <span class="q-g-icon">💡</span>
            <span>{{ item.grammar }}</span>
          </div>

          <div v-if="item.vocab && item.vocab.length" class="q-vocab">
            <span v-for="v in item.vocab" :key="v.ko" class="v-chip">{{ v.ko }} · {{ v.zh }}</span>
          </div>

          <div v-if="item.similar && item.similar.length" class="q-similar">
            <span class="s-label">相似表达：</span>
            <span v-for="sm in item.similar" :key="sm" class="s-item">{{ sm }}</span>
          </div>

          <div class="q-ops">
            <span class="opb" :class="{ 'opb-fav': item.isFav }" @click="onFavTap(item.id)">{{ item.isFav ? '⭐ 已藏' : '☆ 收藏' }}</span>
            <span class="opb" @click="onFollowTap(item.id)">🎤 跟读</span>
            <span class="opb" @click="onAskTap(item.id)">💬 问 AI</span>
            <span class="opb" @click="onShareImgTap(item.id)">🖼 分享</span>
          </div>
        </div>
      </div>

      <div ref="sentinel" class="list-end" v-if="data.quotes.length">{{ data.hasMore ? '上滑加载更多 ↓' : '— 到底啦，点上方 AI 换一批 —' }}</div>
      <div class="empty" v-if="!data.quotes.length">该筛选下暂无名句，换个筛选或点 AI 生成 ✨</div>
    </div>

    <!-- ===== 转化 CTA ===== -->
    <div class="cta stick" @click="onGoChat">
      <div class="cta-text">
        <div class="cta-title">想系统学韩语？</div>
        <div class="cta-sub">去对话页，让 AI 老师带你练这句话 →</div>
      </div>
      <div class="cta-go">GO</div>
    </div>
  </div>
</template>

<style scoped>
/* ===== Hero 轮播 ===== */
.hero-wrap { margin: 12px 12px 4px; }
.hero-viewport { position: relative; min-height: 210px; }
.hero-card {
  position: absolute; inset: 0;
  border-radius: 18px;
  padding: 18px 20px;
  color: #fff;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  justify-content: center;
  animation: hero-fade 0.5s ease-out;
}
@keyframes hero-fade {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.hero-badge {
  align-self: flex-start;
  font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
  background: rgba(255, 255, 255, 0.25);
  padding: 3px 10px; border-radius: 999px;
  margin-bottom: 10px;
  backdrop-filter: blur(4px);
}
.hero-drama { font-size: 12px; font-weight: 700; opacity: 0.9; }
.hero-ko { margin-top: 8px; font-size: 22px; font-weight: 900; line-height: 1.35; text-shadow: 0 1px 4px rgba(0,0,0,0.12); }
.hero-roman { margin-top: 6px; font-size: 12px; opacity: 0.92; letter-spacing: 0.3px; }
.hero-zh { margin-top: 4px; font-size: 13px; opacity: 0.95; }
.hero-speaker {
  margin-top: 12px;
  align-self: flex-start;
  font-size: 12px; font-weight: 700;
  background: rgba(255, 255, 255, 0.22);
  padding: 5px 14px; border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.hero-dots { display: flex; justify-content: center; gap: 6px; padding: 10px 0 2px; }
.hd { width: 6px; height: 6px; border-radius: 50%; background: rgba(14, 24, 54, 0.18); transition: all 0.25s ease-out; cursor: pointer; }
.hd-on { background: var(--c-klein); width: 16px; border-radius: 999px; }

/* ===== 筛选 ===== */
.filters { padding: 8px 12px 0; }
.filter-row {
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 0;
}
.filter-row::-webkit-scrollbar { display: none; }
.filter-row-last { flex-wrap: wrap; overflow: visible; }
.ftag {
  flex-shrink: 0;
  padding: 4px 11px;
  border-radius: 999px;
  background: #fff;
  color: var(--c-ink-soft);
  font-size: 12px; font-weight: 600;
  border: 1px solid var(--c-border);
  cursor: pointer;
  transition: all 0.2s ease-out;
}
.ftag:active { transform: scale(0.94); }
.ftag-on { background: var(--c-klein); color: #fff; border-color: var(--c-klein); }
.ftag-ai { background: var(--c-sky-mist); color: var(--c-klein-deep); border-color: transparent; font-weight: 700; }
.ftag-ai.loading { opacity: 0.7; }

/* ===== 名句卡片流 ===== */
.cards { padding: 8px 12px 0; }
.qcard-outer { margin-bottom: 12px; }
.qcard {
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: var(--shadow-sticker);
  border: 1px solid rgba(14, 24, 54, 0.05);
}
.q-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
.q-ko { margin-top: 10px; font-size: 19px; font-weight: 800; color: var(--c-ink); line-height: 1.45; user-select: text; }
.q-roman {
  margin-top: 8px;
  display: flex; align-items: flex-start; gap: 5px;
  font-size: 13px; color: var(--c-klein-deep);
  cursor: pointer;
  user-select: text;
}
.q-roman-icon { flex-shrink: 0; }
.q-zh { margin-top: 6px; font-size: 14px; color: var(--c-ink-soft); user-select: text; }
.q-grammar {
  margin-top: 10px;
  display: flex; align-items: flex-start; gap: 5px;
  padding: 8px 10px;
  background: rgba(255, 243, 196, 0.55);
  border-radius: 9px;
  font-size: 12.5px; line-height: 1.6; color: var(--c-ink-soft);
  user-select: text;
}
.q-g-icon { flex-shrink: 0; }
.q-vocab { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.v-chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--c-border);
  font-size: 11.5px; color: var(--c-ink-soft);
}
.q-similar { margin-top: 8px; font-size: 12px; color: var(--c-mute); line-height: 1.7; }
.s-label { font-weight: 700; }
.s-item { margin-right: 8px; }

.q-ops {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed rgba(14, 24, 54, 0.14);
  display: flex; flex-wrap: wrap; gap: 8px;
}
.opb {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--c-border);
  font-size: 12px; font-weight: 700; color: var(--c-ink-soft);
  cursor: pointer;
  transition: all 0.18s ease-out;
}
.opb:active { transform: scale(0.92); }
.opb-fav { background: #FFF6D9; color: #8A6D1A; border-color: transparent; }

.list-end { text-align: center; font-size: 11px; color: var(--c-mute); padding: 12px 0 4px; }
.empty { text-align: center; font-size: 13px; color: var(--c-mute); padding: 36px 0; }

/* ===== 转化 CTA ===== */
.cta {
  display: flex; align-items: center; justify-content: space-between;
  margin: 14px 12px 0;
  padding: 14px 18px;
  cursor: pointer;
}
.cta-title { font-size: 15px; font-weight: 800; color: var(--c-ink); }
.cta-sub { margin-top: 3px; font-size: 12px; color: var(--c-mute); }
.cta-go {
  flex: none;
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--c-klein);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 900;
  box-shadow: 0 3px 9px rgba(0, 113, 227, 0.3);
}
</style>
