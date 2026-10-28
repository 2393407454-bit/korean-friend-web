// 分级课程进度：统一读写入口，页面间共享同一份响应式缓存
import { reactive } from 'vue';
import { get, post } from './client';
import { currentUid } from '../utils/storage';

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

// 完成一次模式练习后结算；返回 { gain, first, best }
export function submitProgress({ unitId, lessonId, mode, score, minutes }) {
  return post('/api/course/progress', { unitId, lessonId, mode, score, minutes })
    .then((res) => {
      apply(res);
      return res;
    });
}
