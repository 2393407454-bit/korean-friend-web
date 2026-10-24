const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/store');
const characters = require('../src/characters');
const { buildSystemPrompt, buildStreamSystemPrompt } = require('../src/system-prompt');

function newDoc(id = 'prompt-test') {
  return store.defaultUser(id);
}

test('prompts present the tutor as a well-rounded Korean friend, not a textbook bot', () => {
  const doc = newDoc();
  const input = '最近想聊聊韩综';
  const standard = buildSystemPrompt(doc, null, '', null, input);
  const streaming = buildStreamSystemPrompt(doc, null, '', null, input);
  for (const required of ['教学范围是全方位的', '文化娱乐', '老师兼懂韩国的朋友']) {
    assert.match(standard, new RegExp(required));
    assert.match(streaming, new RegExp(required));
  }
});

test('prompts allow casual chats about K-pop, dramas and daily life without dragging users back to lessons', () => {
  const doc = newDoc();
  const standard = buildSystemPrompt(doc, null, '', null, '我想聊聊最近的韩剧');
  for (const required of ['K-pop', '韩剧', '顺着主题自然交流', '不要把每次闲聊都强行拽回课程']) {
    assert.match(standard, new RegExp(required));
  }
});

test('free-chat mode weaves one Korean expression into cultural small talk', () => {
  const doc = newDoc();
  const standard = buildSystemPrompt(doc, null, '', null, '我想聊聊 K-pop 应援');
  assert.match(standard, /顺手带一句相关的韩语表达/);
  assert.match(standard, /紧跟中文翻译/);
});

test('all characters keep bilingual beginner rules and broad topic coverage', () => {
  assert.equal(characters.DEFAULT_ID, 'jiwoo');
  for (const c of Object.values(characters.CHARACTERS)) {
    assert.match(c.persona, /简体中文翻译/);
  }
  assert.match(characters.CHARACTERS.jiwoo.persona, /教学范围全面/);
  assert.match(characters.CHARACTERS.minjun.persona, /韩剧/);
  assert.match(characters.CHARACTERS.gwajang.persona, /합쇼체/);
});
