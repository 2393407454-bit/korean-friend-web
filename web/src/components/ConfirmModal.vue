<script setup>
// 确认弹窗：wx.showModal 的等价物（支持可选输入框，用于管理员密钥验证）
import { ref, watch } from 'vue';

const props = defineProps({
  visible: Boolean,
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  okText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  showCancel: { type: Boolean, default: true },
  danger: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  placeholder: { type: String, default: '' }
});

const emit = defineEmits(['confirm', 'close']);

const inputVal = ref('');
watch(() => props.visible, (v) => { if (v) inputVal.value = ''; });

function onOk() {
  emit('confirm', inputVal.value.trim());
}
</script>

<template>
  <div v-if="visible" class="modal-wrap" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-title">{{ title }}</div>
      <div v-if="content" class="modal-content">{{ content }}</div>
      <input
        v-if="editable"
        v-model="inputVal"
        class="modal-input"
        :placeholder="placeholder"
        @keyup.enter="onOk"
      />
      <div class="modal-btns">
        <div v-if="showCancel" class="modal-btn modal-btn-cancel" @click="emit('close')">{{ cancelText }}</div>
        <div class="modal-btn modal-btn-ok" :class="{ danger }" @click="onOk">{{ okText }}</div>
      </div>
    </div>
  </div>
</template>
