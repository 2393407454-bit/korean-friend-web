// 分级课程进度：统一读写入口，页面间共享同一份响应式缓存
// 后端不可达时，练习结算自动进入本地离线队列，恢复联网后自动补同步，
// 保证「学完的课程记录不丢失」。
import { reactive } from 'vue';
import { get, post } from './client';
import { currentUid } from '../utils/storage';

const QUEUE_KEY = 'kfp_progress_queue';
const QUEUE_MAX = 50;

export const courseState = reactive({
  loaded: false,
  loading: false,
  error: '',
  course: {
    xp: 0,
    progress: {},
    activity: {},
    streak: 0,
    best_streak: 0,
    last_date: '',
    updated_at: null
  }
});

function apply(res) {
  if (!res || !res.course) return;
  courseState.course = res.course;
  courseState.loaded = true;
  courseState.error = '';
}

export function loadCourse(force = false) {
  if (courseState.loading) return Promise.resolve(courseState.course);
  if (courseState.loaded && !force) return Promise.resolve(courseState.course);
  courseState.loading = true;
  return get('/api/course/' + currentUid())
    .then((res) => {
      apply(res);
      courseState.loading = false;
      return courseState.course;
    })
    .catch((e) => {
      courseState.loading = false;
      courseState.error = (e && e.message) || '课程进度加载失败';
      return courseState.course;
    });
}

/* ---------------- 离线队列 ---------------- */
function readQueue() {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(list) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_MAX)));
  } catch (e) { /* 存储满等异常静默 */ }
}

// 当前待补同步的离线记录条数（档案页可用于展示角标）
export function pendingProgressCount() {
  return readQueue().length;
}

// 完成一次模式练习后结算；返回 { gain, first, best }
// 失败时不再直接丢结果：写入离线队列并标记 offline，等网络恢复后补报
export function submitProgress(payload) {
  return post('/api/course/progress', payload)
    .then((res) => {
      apply(res);
      flushProgressQueue();
      return res;
    })
    .catch((e) => {
      const q = readQueue();
      q.push({ ...payload, queued_at: new Date().toISOString() });
      writeQueue(q);
      throw Object.assign(new Error((e && e.message) || '进度暂未同步'), { offline: true });
    });
}

// 依序补报离线队列；全部处理完后按结果重写队列。
// 登录失效（401）时中止并保留剩余记录，等重新登录后再次补报。
let flushing = false;
export function flushProgressQueue() {
  const q = readQueue();
  if (!q.length || flushing) return Promise.resolve(0);
  flushing = true;
  const remaining = [];
  let synced = 0;
  let aborted = false;
  return q.reduce((chain, item) => chain.then(() => {
    if (aborted) { remaining.push(item); return null; }
    return post('/api/course/progress', {
      unitId: item.unitId,
      lessonId: item.lessonId,
      mode: item.mode,
      score: item.score,
      minutes: item.minutes
    }).then((res) => {
      synced += 1;
      apply(res);
    }).catch((e) => {
      if (e && e.status === 401) aborted = true;
      remaining.push(item);
    });
  }), Promise.resolve()).then(() => {
    writeQueue(remaining);
    flushing = false;
    return synced;
  }).catch(() => {
    flushing = false;
    return 0;
  });
}
