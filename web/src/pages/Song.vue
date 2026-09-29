<script setup>
// K-pop 学歌页（自小程序 pages/song 移植）：
// 上传歌词（图片 OCR / LRC / 粘贴）→ AI 歌名候选（用户确认）→ 分句学习 → 跟读评分（真实落库）
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { get, post, uploadFile } from '../api/client';
import { speak, stopSpeak } from '../api/tts';
import { loadCaps, getCaps } from '../api/caps';
import { currentUid, storeGet, storeSet } from '../utils/storage';
import { createRecorder } from '../utils/recorder';
import { showToast } from '../utils/ui';
import ConfirmModal from '../components/ConfirmModal.vue';

function formatConfidence(value) {
  const confidence = Number(value);
  if (!isFinite(confidence) || confidence <= 0) return '';
  return Math.round(Math.min(1, confidence) * 100) + '%';
}

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + month + '-' + day;
}

const data = reactive({
  step: 'upload', // upload | confirm | study
  analyzing: false,
  analyzeMode: '',
  analyzeError: '',
  lyricText: '',
  fanGoal: '副歌听懂',
  todayCount: 0,
  todayGoal: 3,
  todayPercent: 0,
  fanStreak: 0,
  songQuery: '',
  candidates: [],
  summary: '',
  titleInput: '',
  artistInput: '',
  lines: [],
  lineScores: {}, // lineIdx -> {score, advice, asr_text, source} | {evaluating} | {error}
  mySongs: [],
  filteredSongs: [],
  showRoman: true,
  saving: false,
  recording: false,
  recordIdx: -1,
  recordTime: 0
});

const imgInput = ref(null);
const lrcInput = ref(null);
const deleteTarget = ref(null); // { id, title }

let recorder = null;

/* ---------- 追星打卡（本地） ---------- */
function loadFanCheckin() {
  const saved = storeGet('song_fan_checkin_v1') || {};
  const today = localDate();
  if (saved.date !== today) {
    data.todayCount = 0;
    data.todayPercent = 0;
    data.fanStreak = saved.streak || 0;
    return;
  }
  const count = Math.min(data.todayGoal, Number(saved.count) || 0);
  data.todayCount = count;
  data.todayPercent = Math.round(count / data.todayGoal * 100);
  data.fanStreak = Number(saved.streak) || 0;
}

function saveFanCheckin(count, streak) {
  storeSet('song_fan_checkin_v1', { date: localDate(), count, streak });
}

function onPickFanGoal(goal) {
  if (goal) data.fanGoal = goal;
}

function onFanCheckin() {
  const count = Math.min(data.todayGoal, (data.todayCount || 0) + 1);
  const streak = data.todayCount > 0 ? data.fanStreak : (data.fanStreak || 0) + 1;
  data.todayCount = count;
  data.todayPercent = Math.round(count / data.todayGoal * 100);
  data.fanStreak = streak;
  saveFanCheckin(count, streak);
  showToast(count >= data.todayGoal ? '今日追星任务完成' : '已打卡 1 句');
}

/* ---------- 我的歌曲 ---------- */
function loadSongs() {
  get('/api/song/list/' + currentUid()).then((res) => {
    const songs = (res && res.songs) || [];
    data.mySongs = songs;
    data.filteredSongs = filterSongs(songs, data.songQuery);
  }).catch(() => {});
}

function filterSongs(songs, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return songs;
  return songs.filter((song) => (String(song.title || '') + ' ' + String(song.artist || '')).toLowerCase().includes(q));
}

function onSongQuery(e) {
  data.songQuery = e.target.value || '';
  data.filteredSongs = filterSongs(data.mySongs, data.songQuery);
}

function onDeleteSong(song) {
  deleteTarget.value = song;
}

function onDeleteConfirm() {
  const song = deleteTarget.value;
  deleteTarget.value = null;
  if (!song) return;
  post('/api/song/delete', { userId: currentUid(), songId: song.id })
    .then(() => {
      const songs = data.mySongs.filter((s) => s.id !== song.id);
      data.mySongs = songs;
      data.filteredSongs = filterSongs(songs, data.songQuery);
      showToast('已删除歌词卡');
    })
    .catch((error) => showToast((error && error.error) || '删除失败，请重试'));
}

/* ---------- 上传与分析 ---------- */
function onLyricInput(e) {
  data.lyricText = e.target.value;
}

function onChooseImage() {
  if (data.analyzing) return;
  imgInput.value && imgInput.value.click();
}

function onChooseLrcFile() {
  if (data.analyzing) return;
  lrcInput.value && lrcInput.value.click();
}

function onImagePicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  // 相册原图可能几 MB：客户端先压到适合歌词 OCR 的尺寸（对齐小程序 compressImage 1600px/72）
  compressImage(file, 1600, 0.72)
    .then((compressed) => analyze({ file: compressed || file, source: 'image' }))
    .catch(() => analyze({ file, source: 'image' }));
}

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    try {
      if (!/^image\//.test(file.type) || file.type === 'image/gif') return resolve(file);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxWidth / img.width);
        if (scale >= 1) return resolve(file);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], 'lyrics.jpg', { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    } catch (e) {
      resolve(file);
    }
  });
}

function onLrcPicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  analyze({ file, source: 'lrc' });
}

function onAnalyzeText() {
  if (data.analyzing) return;
  const text = (data.lyricText || '').trim();
  if (!text) return showToast('先粘贴一段歌词');
  analyze({ text, source: 'paste' });
}

function analyze({ file, text, source }) {
  const mode = source === 'image' ? 'image' : (source === 'lrc' ? 'file' : 'text');
  data.analyzing = true;
  data.analyzeMode = mode;
  data.analyzeError = '';
  const ok = (res) => {
    data.analyzing = false;
    data.analyzeMode = '';
    if (!res || !res.lines || !res.lines.length) {
      data.analyzeError = '没解析出可学习的句子，换张更清晰的图或直接粘贴文本';
      return;
    }
    const candidates = (res.candidates || []).map((candidate) => Object.assign({}, candidate, {
      confidenceText: formatConfidence(candidate && candidate.confidence)
    }));
    data.candidates = candidates;
    data.summary = res.summary || '';
    data.titleInput = candidates.length ? candidates[0].title : '';
    data.artistInput = candidates.length ? candidates[0].artist : '';
    data.lines = (res.lines || []).map((l, i) => Object.assign({ _i: i }, l, { vocab: l.vocab || [] }));
    data.lineScores = {};
    data.step = 'confirm';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const fail = () => {
    data.analyzing = false;
    data.analyzeMode = '';
    data.analyzeError = '分析失败，请检查网络后重试';
  };
  if (file) uploadFile('/api/song/analyze', file, { source }).then(ok).catch(fail);
  else post('/api/song/analyze', { text, source: source || 'paste' }).then(ok).catch(fail);
}

/* ---------- 歌名确认 ---------- */
function onPickCandidate(c) {
  data.titleInput = c.title;
  data.artistInput = c.artist;
}

function onTitleInput(e) { data.titleInput = e.target.value; }
function onArtistInput(e) { data.artistInput = e.target.value; }

function onBackUpload() {
  data.step = 'upload';
  data.candidates = [];
  data.lines = [];
  data.analyzeError = '';
  data.lyricText = '';
}

function onSaveSong() {
  const title = (data.titleInput || '').trim();
  if (!title) return showToast('请确认或输入歌名');
  if (data.saving) return;
  data.saving = true;
  post('/api/song/save', {
    userId: currentUid(),
    title,
    artist: (data.artistInput || '').trim(),
    summary: (data.summary || '').trim(),
    lines: data.lines
  }).then(() => {
    data.saving = false;
    data.step = 'study';
    loadSongs();
    showToast('已加入我的歌曲 🎵');
  }).catch((e) => {
    data.saving = false;
    showToast((e && e.error) || '保存失败');
  });
}

/* ---------- 学习：点读 / 跟读评分 / 生词 ---------- */
function onSpeakLine(line) {
  if (line && line.ko) speak(line.ko);
}

function onToggleRoman() {
  data.showRoman = !data.showRoman;
}

async function onLineRecord(i) {
  if (data.recording) {
    if (data.recordIdx === i) await finishRecord();
    return; // 录别的句子时先把当前停掉（等当前停止回调）
  }
  const line = data.lines[i];
  if (!line || !line.ko) return;
  if (!getCaps().asr) {
    return showToast('后端未配置语音识别');
  }
  try {
    if (!recorder) recorder = createRecorder();
    data.recording = true;
    data.recordIdx = i;
    data.recordTime = 0;
    await recorder.start({
      maxSeconds: 30,
      onTick: (sec) => { data.recordTime = sec; }
    });
  } catch (e) {
    data.recording = false;
    data.recordIdx = -1;
    showToast((e && e.name) === 'NotAllowedError' ? '麦克风权限被拒绝' : '录音启动失败');
  }
}

async function finishRecord() {
  data.recording = false;
  const i = data.recordIdx;
  data.recordTime = 0;
  data.recordIdx = -1;
  const res = await recorder.stop();
  if (!res || !res.blob || i < 0) return;
  const line = data.lines[i];
  if (!line) return;
  data.lineScores = { ...data.lineScores, [i]: { evaluating: true } };
  const file = new File([res.blob], 'record.wav', { type: 'audio/wav' });
  uploadFile('/api/pronounce', file, { target: line.ko, userId: currentUid() })
    .then((r) => {
      data.lineScores = {
        ...data.lineScores,
        [i]: { score: r.score, advice: r.advice, asr_text: r.asr_text, source: r.source }
      };
      showToast('得分 ' + (r.score || 0));
    })
    .catch(() => {
      data.lineScores = { ...data.lineScores, [i]: { error: true } };
      showToast('评分失败，请重试');
    });
}

function onAddVocab(i, v) {
  const line = data.lines[i];
  const w = line && line.vocab && line.vocab[v];
  if (!w || !w.ko) return;
  post('/api/song/vocab', { userId: currentUid(), ko: w.ko, zh: w.zh }).then((r) => {
    showToast(r && r.added ? '已入生词本 📒' : '生词本里已有');
  }).catch(() => showToast('添加失败'));
}

/* ---------- 我的歌曲 ---------- */
function onOpenSong(id) {
  get('/api/song/get/' + currentUid() + '/' + id).then((res) => {
    const song = res && res.song;
    if (!song || !song.lines) return showToast('歌曲读取失败');
    data.titleInput = song.title;
    data.artistInput = song.artist;
    data.summary = song.summary || '';
    data.lines = song.lines.map((l, i) => Object.assign({ _i: i }, l, { vocab: l.vocab || [] }));
    data.lineScores = {};
    data.showRoman = true;
    data.step = 'study';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }).catch(() => showToast('歌曲读取失败'));
}

function onNewSong() {
  data.step = 'upload';
  data.lyricText = '';
  data.candidates = [];
  data.lines = [];
  data.analyzeError = '';
}

onBeforeUnmount(() => {
  stopSpeak();
  if (recorder) recorder.cancel();
});

loadCaps();
loadFanCheckin();
loadSongs();
</script>

<template>
  <div class="page page-song">
    <!-- ===== 步骤一：追星女无痛学歌入口 ===== -->
    <template v-if="data.step === 'upload'">
      <div class="stick fan-hero pop pop-0">
        <div class="fan-kicker">追星女无痛学韩语</div>
        <div class="fan-title">把本命歌词，变成你的韩语课</div>
        <div class="fan-sub">不啃语法书，先把最想唱的那一句学会。</div>
        <div class="fan-goals">
          <span class="fan-goal" :class="{ 'fan-goal-on': data.fanGoal === '副歌听懂' }" @click="onPickFanGoal('副歌听懂')">副歌听懂</span>
          <span class="fan-goal" :class="{ 'fan-goal-on': data.fanGoal === '跟唱一遍' }" @click="onPickFanGoal('跟唱一遍')">跟唱一遍</span>
          <span class="fan-goal" :class="{ 'fan-goal-on': data.fanGoal === '收藏生词' }" @click="onPickFanGoal('收藏生词')">收藏生词</span>
        </div>
        <div class="fan-progress-row">
          <div class="fan-progress-copy"><span class="fan-count">{{ data.todayCount }}/{{ data.todayGoal }}</span><span>句今日轻任务 · 连续 {{ data.fanStreak }} 天</span></div>
          <div class="fan-progress"><div class="fan-progress-fill" :style="{ width: data.todayPercent + '%' }"></div></div>
        </div>
        <div class="fan-checkin" :class="{ 'fan-checkin-done': data.todayCount >= data.todayGoal }" @click="onFanCheckin">{{ data.todayCount >= data.todayGoal ? '今天已完成，明天继续' : '完成一句就打卡' }}</div>
      </div>

      <div class="stick card pop pop-1">
        <div class="card-head">
          <div class="ch-title"><span class="ch-emoji">🎤</span><span class="ch-name">做一张本命歌词卡</span></div>
          <span class="ch-tag">{{ data.fanGoal }}</span>
        </div>
        <div class="card-sub">上传歌词原文后，AI 只分析你提供的内容：拆成“韩文 + 罗马音 + 中文 + 语法 + 重点词”，不会根据歌名或歌词片段猜测其他歌词。</div>

        <div class="up-actions">
          <div class="up-btn up-btn-main" @click="onChooseImage">
            <span class="up-ico">📷</span>
            <span>拍歌词图</span>
          </div>
          <div class="up-btn" @click="onChooseLrcFile">
            <span class="up-ico">📃</span>
            <span>上传 LRC</span>
          </div>
          <div class="up-btn" @click="onAnalyzeText">
            <span class="up-ico">📄</span>
            <span>粘贴内容</span>
          </div>
        </div>

        <textarea
          class="lyric-input"
          v-model="data.lyricText"
          placeholder="先写歌名 - 歌手，再粘贴最想学的 3～8 句歌词…"
          maxlength="3000"
          @input="onLyricInput"
        ></textarea>

        <div v-if="data.analyzeError" class="analyze-err">{{ data.analyzeError }}</div>
      </div>

      <!-- 分析中 -->
      <div v-if="data.analyzing" class="stick card pop pop-1">
        <div class="ai-thinking">
          <div class="ai-dots"><span>●</span><span>●</span><span>●</span></div>
          <div class="ai-text">{{ data.analyzeMode === 'image' ? '正在读取歌词图…' : (data.analyzeMode === 'file' ? '正在分析 LRC 原文…' : '正在分析你粘贴的内容…') }}</div>
        </div>
      </div>

      <!-- 我的歌曲 -->
      <div v-if="data.mySongs.length" class="stick card song-library pop pop-2">
        <div class="card-head">
          <div class="ch-title"><span class="ch-name">我的歌词卡</span></div>
          <span class="ch-tag ch-tag-plain">{{ data.mySongs.length }} 首</span>
        </div>
        <div class="song-search">
          <span class="song-search-ico">⌕</span>
          <input class="song-search-input" :value="data.songQuery" placeholder="搜索歌名 / 歌手" @input="onSongQuery" />
        </div>
        <div v-if="!data.filteredSongs.length" class="song-empty">没有找到这首，直接在上面添加歌词就好</div>
        <div v-for="song in data.filteredSongs" :key="song.id" class="song-row" @click="onOpenSong(song.id)">
          <span class="song-row-ico">🎵</span>
          <div class="song-row-txt">
            <div class="song-row-t">{{ song.title }}</div>
            <div class="song-row-s">{{ song.artist || '未知歌手' }} · {{ song.lineCount }} 句</div>
          </div>
          <span class="song-row-delete" @click.stop="onDeleteSong(song)">删除</span>
          <span class="song-row-arrow">→</span>
        </div>
      </div>
    </template>

    <!-- ===== 步骤二：确认歌名 ===== -->
    <template v-if="data.step === 'confirm'">
      <div class="stick card pop pop-0">
        <div class="card-head">
          <div class="ch-title"><span class="ch-name">确认歌曲信息</span></div>
          <span class="ch-tag ch-tag-plain">你拍板 · AI 不瞎猜</span>
        </div>
        <div class="card-sub">先选对本命，再轻松学几句。AI 给出的 {{ data.candidates.length || '0' }} 个候选只是参考，歌名以你确认为准：</div>

        <div v-if="data.candidates.length" class="cand-list">
          <span v-for="(c, i) in data.candidates" :key="c.title" class="cand-chip" @click="onPickCandidate(c)">
            <span class="cand-t">{{ c.title }}</span>
            <span v-if="c.artist" class="cand-a">· {{ c.artist }}</span>
            <span v-if="c.confidenceText" class="cand-c">{{ c.confidenceText }}</span>
          </span>
        </div>

        <div class="form-row">
          <span class="form-k">歌名</span>
          <input class="form-v" :value="data.titleInput" placeholder="输入歌名（必填）" @input="onTitleInput" />
        </div>
        <div class="form-row">
          <span class="form-k">歌手</span>
          <input class="form-v" :value="data.artistInput" placeholder="选填" @input="onArtistInput" />
        </div>

        <div v-if="data.summary" class="song-summary"><span class="summary-label">内容总结</span>{{ data.summary }}</div>
        <div class="preview">已做好 {{ data.lines.length }} 句歌词卡，今天先学 3 句就好</div>

        <div class="confirm-btns">
          <div class="btn-ghost" @click="onBackUpload">重新分析</div>
          <div class="confirm-btn" :class="{ 'btn-off': data.saving }" @click="onSaveSong">{{ data.saving ? '保存中…' : '保存并开始学习 →' }}</div>
        </div>
      </div>
    </template>

    <!-- ===== 步骤三：歌词学习 ===== -->
    <template v-if="data.step === 'study'">
      <div class="stick card study-head pop pop-0">
        <div class="sh-top">
          <div class="sh-title">
            <span class="sh-ico">🎵</span>
            <div class="sh-txt">
              <div class="sh-t">{{ data.titleInput }}</div>
              <div v-if="data.artistInput" class="sh-a">{{ data.artistInput }}</div>
            </div>
          </div>
          <div class="sh-opts">
            <span class="sh-opt" :class="{ 'sh-opt-on': data.showRoman }" @click="onToggleRoman">罗马音</span>
            <span class="sh-opt" @click="onNewSong">新歌</span>
          </div>
        </div>
        <div class="sh-hint">先听懂一句，再跟唱一句；点单词即可收藏到生词本</div>
        <div class="study-mini-progress">
          <div><span class="study-mini-num">{{ data.todayCount }}/{{ data.todayGoal }}</span><span class="study-mini-cap">今日轻任务</span></div>
          <div class="study-mini-action" @click="onFanCheckin">{{ data.todayCount >= data.todayGoal ? '已完成' : '打卡这一句' }}</div>
        </div>
      </div>

      <div v-for="(line, i) in data.lines" :key="line._i" class="song-line stick card pop pop-1">
        <div class="sl-main" @click="onSpeakLine(line)">
          <div class="sl-ko">{{ line.ko }}</div>
          <div v-if="data.showRoman && line.romanization" class="sl-roman"><span class="sl-label">读音</span>{{ line.romanization }}</div>
          <div v-if="line.translation" class="sl-zh"><span class="sl-label">意思</span>{{ line.translation }}</div>
          <div v-if="line.grammar" class="sl-grammar"><span class="sl-g-tag">语法</span>{{ line.grammar }}</div>
          <div v-if="!line.romanization || !line.translation || !line.grammar" class="sl-missing">这句学习卡信息不完整，可重新分析补全</div>
        </div>

        <div v-if="line.vocab.length" class="sl-vocab">
          <span class="sl-vocab-title">重点词</span>
          <span v-for="(v, vi) in line.vocab" :key="v.ko" class="v-chip" @click.stop="onAddVocab(i, vi)">
            <span class="v-ko">{{ v.ko }}</span>
            <span class="v-zh">{{ v.zh }}</span>
            <span class="v-plus">+</span>
          </span>
        </div>

        <div class="sl-foot">
          <div
            class="rec-btn"
            :class="{ 'rec-eval': data.lineScores[i] && data.lineScores[i].evaluating, 'rec-on': data.recording && data.recordIdx === i }"
            @click="onLineRecord(i)"
          >
            <span v-if="data.lineScores[i] && data.lineScores[i].evaluating">评分中…</span>
            <span v-else-if="data.recording && data.recordIdx === i">结束 {{ data.recordTime }}s</span>
            <span v-else>🎙 跟读</span>
          </div>

          <div v-if="data.lineScores[i] && data.lineScores[i].score != null" class="sl-score">
            <span class="ss-num" :class="{ 'ss-good': data.lineScores[i].score >= 80 }">{{ data.lineScores[i].score }}</span>
            <span class="ss-cap">分 · {{ data.lineScores[i].source === 'fallback' ? '估算' : 'AI 评测' }}</span>
          </div>
          <div v-else-if="data.lineScores[i] && data.lineScores[i].error" class="sl-score-err">评分失败</div>
        </div>

        <div v-if="data.lineScores[i] && data.lineScores[i].score != null" class="sl-advice">
          <span class="sl-a-t">教练点评：</span>{{ data.lineScores[i].advice }}
          <div v-if="data.lineScores[i].asr_text" class="sl-a-asr">识别到：{{ data.lineScores[i].asr_text }}</div>
        </div>
      </div>
    </template>

    <div class="safe-bottom"></div>

    <!-- 隐藏文件选择 -->
    <input ref="imgInput" type="file" accept="image/*" hidden @change="onImagePicked" />
    <input ref="lrcInput" type="file" accept=".lrc,text/plain" hidden @change="onLrcPicked" />

    <ConfirmModal
      :visible="!!deleteTarget"
      title="删除歌词卡？"
      :content="deleteTarget ? ('删除「' + deleteTarget.title + '」后，歌词学习卡和这首歌的学习记录都会移除，确定继续吗？') : ''"
      ok-text="删除"
      danger
      @confirm="onDeleteConfirm"
      @close="deleteTarget = null"
    />
  </div>
</template>

<style scoped>
.page-song {
  max-width: 480px;
  margin: 0 auto;
  padding: 12px 12px 0;
}

.stick { margin-bottom: 14px; }

/* ===== 追星 Hero ===== */
.fan-hero { padding: 20px 18px; background: linear-gradient(135deg, #FFE3EC 0%, #EAF3FF 100%); }
.fan-kicker { font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #C2426B; }
.fan-title { margin-top: 8px; font-size: 22px; font-weight: 900; color: var(--c-ink); line-height: 1.3; }
.fan-sub { margin-top: 6px; font-size: 12.5px; color: var(--c-ink-soft); }
.fan-goals { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.fan-goal {
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
  font-size: 12.5px; font-weight: 700; color: var(--c-ink-soft);
  cursor: pointer;
  transition: all 0.2s ease-out;
}
.fan-goal-on { background: var(--c-klein); color: #fff; box-shadow: 0 3px 9px rgba(0, 113, 227, 0.28); }
.fan-progress-row { margin-top: 14px; }
.fan-progress-copy { display: flex; align-items: baseline; gap: 6px; font-size: 11.5px; color: var(--c-ink-soft); }
.fan-count { font-size: 16px; font-weight: 900; color: var(--c-ink); }
.fan-progress {
  margin-top: 6px;
  height: 8px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  overflow: hidden;
}
.fan-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-klein), var(--c-mint));
  border-radius: 999px;
  transition: width 0.6s ease-out;
}
.fan-checkin {
  margin-top: 14px;
  text-align: center;
  padding: 10px 0;
  border-radius: 999px;
  background: var(--c-ink);
  color: #fff;
  font-size: 13.5px; font-weight: 700;
  cursor: pointer;
}
.fan-checkin:active { transform: scale(0.98); }
.fan-checkin-done { background: var(--c-mint); }

/* ===== 卡片通用 ===== */
.card { padding: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.ch-title { display: flex; align-items: center; gap: 6px; }
.ch-emoji { font-size: 17px; }
.ch-name { font-size: 15px; font-weight: 800; color: var(--c-ink); }
.ch-tag {
  font-size: 10px; font-weight: 700; color: var(--c-klein-deep);
  background: var(--c-sky-mist);
  border-radius: 999px; padding: 3px 9px;
}
.ch-tag-plain { background: #F2F2F7; color: var(--c-mute); }
.card-sub { font-size: 12px; color: var(--c-mute); line-height: 1.6; }

/* ===== 上传动作 ===== */
.up-actions { display: flex; gap: 8px; margin-top: 14px; }
.up-btn {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 0;
  border-radius: 12px;
  background: var(--c-cream);
  border: 1px dashed var(--c-border);
  font-size: 12.5px; font-weight: 700; color: var(--c-ink-soft);
  cursor: pointer;
  transition: all 0.2s ease-out;
}
.up-btn:active { transform: scale(0.95); background: var(--c-sky-soft); }
.up-btn-main { background: var(--c-sky-mist); border-color: rgba(0, 113, 227, 0.3); color: var(--c-klein-deep); }
.up-ico { font-size: 20px; }

.lyric-input {
  width: 100%;
  margin-top: 12px;
  min-height: 110px;
  border: 1.5px solid var(--c-border);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13.5px;
  line-height: 1.6;
  resize: vertical;
  background: var(--c-paper);
}
.lyric-input:focus { border-color: var(--c-klein); }
.analyze-err {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #FFE9E8;
  color: var(--c-coral);
  font-size: 12.5px;
}

/* ===== 分析中 ===== */
.ai-thinking { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.ai-dots { display: flex; gap: 4px; color: var(--c-klein); }
.ai-dots span { animation: dot-blink 1.2s ease-in-out infinite; }
.ai-dots span:nth-child(2) { animation-delay: 0.2s; }
.ai-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-blink { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.ai-text { font-size: 13.5px; font-weight: 700; color: var(--c-ink-soft); }

/* ===== 我的歌曲 ===== */
.song-search {
  display: flex; align-items: center; gap: 6px;
  background: var(--c-cream);
  border-radius: 999px;
  padding: 7px 12px;
  margin-bottom: 10px;
}
.song-search-ico { color: var(--c-mute); }
.song-search-input { flex: 1; border: none; background: none; font-size: 13px; }
.song-empty { font-size: 12px; color: var(--c-mute); text-align: center; padding: 12px 0; }
.song-row {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 2px;
  border-bottom: 1px solid #F0F0F3;
  cursor: pointer;
}
.song-row:last-child { border-bottom: none; }
.song-row:active { background: var(--c-sky-soft); }
.song-row-ico { font-size: 17px; flex: none; }
.song-row-txt { flex: 1; min-width: 0; }
.song-row-t { font-size: 14px; font-weight: 700; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.song-row-s { margin-top: 2px; font-size: 11px; color: var(--c-mute); }
.song-row-delete {
  flex: none;
  font-size: 11px; color: var(--c-coral);
  background: #FFE9E8;
  border-radius: 999px;
  padding: 3px 10px;
  cursor: pointer;
}
.song-row-arrow { color: #C7C7CC; flex: none; }

/* ===== 确认步骤 ===== */
.cand-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.cand-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 13px;
  border-radius: 999px;
  background: var(--c-sky-soft);
  border: 1px solid #DCEDFF;
  font-size: 12.5px; font-weight: 700; color: var(--c-ink);
  cursor: pointer;
}
.cand-chip:active { transform: scale(0.95); background: var(--c-sky-mist); }
.cand-t { font-weight: 800; }
.cand-a { font-weight: 500; color: var(--c-ink-soft); }
.cand-c { font-size: 10px; color: var(--c-klein-deep); background: #fff; border-radius: 999px; padding: 1px 6px; }
.form-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid #F0F0F3;
}
.form-k { flex: none; font-size: 13px; font-weight: 700; color: var(--c-ink-soft); width: 34px; }
.form-v { flex: 1; border: none; font-size: 14px; background: none; padding: 4px 0; }
.song-summary {
  margin-top: 12px;
  padding: 9px 12px;
  background: var(--c-cream);
  border-radius: 10px;
  font-size: 12.5px; color: var(--c-ink-soft); line-height: 1.6;
}
.summary-label { font-weight: 800; margin-right: 6px; color: var(--c-ink); }
.preview { margin-top: 12px; font-size: 12.5px; color: var(--c-mute); }
.confirm-btns { display: flex; gap: 10px; margin-top: 16px; }
.confirm-btns .btn-ghost { flex: none; padding: 10px 18px; }
.confirm-btn {
  flex: 1;
  text-align: center;
  padding: 11px 0;
  border-radius: 999px;
  background: var(--c-klein);
  color: #fff;
  font-size: 14px; font-weight: 700;
  box-shadow: 0 3px 9px rgba(0, 113, 227, 0.3);
  cursor: pointer;
}
.confirm-btn:active { transform: scale(0.97); }
.btn-off { opacity: 0.6; }

/* ===== 学习步骤 ===== */
.study-head { padding: 16px; }
.sh-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.sh-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sh-ico { font-size: 22px; flex: none; }
.sh-txt { min-width: 0; }
.sh-t { font-size: 18px; font-weight: 900; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sh-a { margin-top: 2px; font-size: 12px; color: var(--c-mute); }
.sh-opts { display: flex; gap: 6px; flex: none; }
.sh-opt {
  padding: 4px 11px;
  border-radius: 999px;
  background: var(--c-cream);
  font-size: 11.5px; font-weight: 700; color: var(--c-ink-soft);
  cursor: pointer;
}
.sh-opt-on { background: var(--c-klein); color: #fff; }
.sh-hint { margin-top: 10px; font-size: 12px; color: var(--c-mute); }
.study-mini-progress {
  margin-top: 12px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px;
  background: var(--c-sky-soft);
  border-radius: 10px;
}
.study-mini-num { font-size: 14px; font-weight: 900; color: var(--c-klein-deep); margin-right: 6px; }
.study-mini-cap { font-size: 11.5px; color: var(--c-ink-soft); }
.study-mini-action {
  font-size: 12px; font-weight: 700;
  color: #fff;
  background: var(--c-klein);
  border-radius: 999px;
  padding: 5px 13px;
  cursor: pointer;
}

/* ===== 歌词卡 ===== */
.song-line { padding: 14px 16px; }
.sl-main { cursor: pointer; }
.sl-ko { font-size: 18px; font-weight: 800; color: var(--c-ink); line-height: 1.5; }
.sl-label {
  display: inline-block;
  font-size: 9.5px; font-weight: 800;
  background: var(--c-honey); color: var(--c-ink);
  border-radius: 4px; padding: 1px 5px;
  margin-right: 6px;
}
.sl-roman { margin-top: 7px; font-size: 13px; color: var(--c-klein-deep); }
.sl-zh { margin-top: 5px; font-size: 13px; color: var(--c-ink-soft); }
.sl-grammar { margin-top: 7px; font-size: 12px; color: var(--c-ink-soft); line-height: 1.6; }
.sl-g-tag {
  display: inline-block;
  font-size: 9.5px; font-weight: 800;
  background: #E5F6F1; color: #1E7A67;
  border-radius: 4px; padding: 1px 5px;
  margin-right: 6px;
}
.sl-missing { margin-top: 6px; font-size: 11px; color: var(--c-mute); }

.sl-vocab { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sl-vocab-title { font-size: 11px; font-weight: 700; color: var(--c-mute); margin-right: 2px; }
.v-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--c-border);
  font-size: 11.5px;
  cursor: pointer;
}
.v-chip:active { transform: scale(0.94); background: var(--c-sky-mist); }
.v-ko { font-weight: 700; color: var(--c-ink); }
.v-zh { color: var(--c-mute); }
.v-plus { color: var(--c-klein); font-weight: 900; }

.sl-foot { margin-top: 12px; display: flex; align-items: center; gap: 10px; }
.rec-btn {
  flex: none;
  padding: 7px 16px;
  border-radius: 999px;
  background: var(--c-cream);
  font-size: 12.5px; font-weight: 700; color: var(--c-klein-deep);
  cursor: pointer;
  user-select: none;
}
.rec-btn:active { transform: scale(0.94); }
.rec-eval { opacity: 0.7; }
.rec-on {
  background: var(--c-coral);
  color: #fff;
  animation: mic-pulse 1.4s ease-in-out infinite;
}
@keyframes mic-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
.sl-score { display: flex; align-items: baseline; gap: 4px; }
.ss-num { font-size: 20px; font-weight: 900; color: var(--c-ink); }
.ss-num.ss-good { color: var(--c-mint); }
.ss-cap { font-size: 11px; color: var(--c-mute); }
.sl-score-err { font-size: 12px; color: var(--c-coral); }
.sl-advice {
  margin-top: 10px;
  padding: 9px 12px;
  background: var(--c-cream);
  border-radius: 10px;
  font-size: 12.5px; color: var(--c-ink); line-height: 1.6;
}
.sl-a-t { font-weight: 800; }
.sl-a-asr { margin-top: 4px; font-size: 11.5px; color: var(--c-mute); }
</style>
