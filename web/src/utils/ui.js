// 轻提示：wx.showToast 的等价物（App.vue 全局渲染）
import { reactive } from 'vue';

export const toastState = reactive({ msg: '', visible: false });
let toastTimer = null;

export function showToast(msg, duration = 2000) {
  toastState.msg = String(msg || '');
  toastState.visible = !!toastState.msg;
  if (toastTimer) clearTimeout(toastTimer);
  if (toastState.visible) {
    toastTimer = setTimeout(() => { toastState.visible = false; }, duration);
  }
}
