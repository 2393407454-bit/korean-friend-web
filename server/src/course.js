// 分级课程进度：A1/A2/B1 × 6 单元 × 3 课时的真实学习记录
// 只负责「记录 + 结算」，课程内容与解锁规则由前端 data/korean-course.js 维护
const store = require('./store');

const MODES = ['vocab', 'grammar', 'speaking', 'listening'];
const ID_RE = /^[\w-]{1,64}$/;

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

function getCourse(userId) {
  const doc = store.loadUser(userId);
  return {
    ok: true,
    course: doc.course,
    courseProgress: doc.course.progress,
    activity: doc.course.activity
  };
}

// 完成一次模式练习：首次 +20 XP，重复练习仅在刷新最佳分时 +5 XP
function recordProgress({ userId, unitId, lessonId, mode, score, minutes }) {
  if (!ID_RE.test(String(unitId || '')) || !ID_RE.test(String(lessonId || ''))) {
    throw Object.assign(new Error('unitId/lessonId required'), { status: 400 });
  }
  if (!MODES.includes(mode)) {
    throw Object.assign(new Error('mode invalid'), { status: 400 });
  }
  const safeScore = Math.round(clamp(score, 0, 100));

  const doc = store.loadUser(userId);
  const course = doc.course;

  const unitProg = course.progress[unitId] || (course.progress[unitId] = {});
  const lessonProg = unitProg[lessonId] || (unitProg[lessonId] = {});
  const prev = lessonProg[mode] || null;
  const prevBest = prev && prev.best != null ? prev.best : 0;
  const first = !(prev && prev.completed);

  let gain = 0;
  if (first) gain = 20;
  else if (safeScore >= prevBest) gain = 5;
  course.xp += gain;

  lessonProg[mode] = {
    score: safeScore,
    best: Math.max(prevBest, safeScore),
    completed: true,
    tries: (prev && prev.tries ? prev.tries : 0) + 1,
    completed_at: new Date().toISOString()
  };

  // 学习时长：每次练习按课时长度折算，单日上限 180 分钟，防异常刷量
  const day = localDateKey();
  const mins = Math.round(clamp(minutes, 1, 30));
  course.activity[day] = Math.min(180, (course.activity[day] || 0) + mins);

  // 连续学习天数：今天首次学习时结算，跨天中断则从 1 重新开始
  if (course.last_date !== day) {
    const yesterday = localDateKey(new Date(Date.now() - 86400000));
    course.streak = course.last_date === yesterday ? (course.streak || 0) + 1 : 1;
    course.last_date = day;
    course.best_streak = Math.max(course.best_streak || 0, course.streak);
  }

  course.updated_at = new Date().toISOString();
  store.saveUser(doc);

  return {
    ok: true,
    gain,
    first,
    score: safeScore,
    best: lessonProg[mode].best,
    course,
    courseProgress: course.progress,
    activity: course.activity
  };
}

module.exports = { getCourse, recordProgress, MODES };
