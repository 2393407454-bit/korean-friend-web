const test = require('node:test');
const assert = require('node:assert/strict');
const agent = require('../src/agent');
const llm = require('../src/llm');
const security = require('../src/security');

const BAD = '안녕히 가세요 잘 가요 또 만나요 안녕 히'; // 单行 16 个韩字无翻译，触发严重违规
const GOOD = '안녕히 가세요（再见）\n@@STATE@@{}';

test('stream path self-heals an untranslated reply by retrying with a repair note', async () => {
  const origStream = llm.chatStream;
  const origCheck = security.checkText;
  const calls = [];
  security.checkText = async () => true;
  llm.chatStream = async (messages) => {
    calls.push(messages);
    if (calls.length === 1) return `${BAD}\n@@STATE@@{}`;
    assert.match(messages[1].content, /紧跟自然、准确的简体中文翻译/);
    return GOOD;
  };
  try {
    const out = await agent.handleChatStream({ userId: 'test-repair-stream', text: '再见怎么说韩语', onDelta: () => {} });
    assert.equal(calls.length, 2);
    assert.match(out.display, /再见/);
    assert.doesNotMatch(out.display, /抱歉/);
  } finally {
    llm.chatStream = origStream;
    security.checkText = origCheck;
  }
});

test('stream path falls back to the apology only when the retry also fails', async () => {
  const origStream = llm.chatStream;
  const origCheck = security.checkText;
  const calls = [];
  security.checkText = async () => true;
  llm.chatStream = async () => {
    calls.push(1);
    return `${BAD}\n@@STATE@@{}`;
  };
  try {
    const out = await agent.handleChatStream({ userId: 'test-repair-fallback', text: '再见怎么说韩语', onDelta: () => {} });
    assert.equal(calls.length, 2);
    assert.match(out.display, /抱歉/);
  } finally {
    llm.chatStream = origStream;
    security.checkText = origCheck;
  }
});

test('non-stream path self-heals via chatJSON retry before the apology guard', async () => {
  const origJSON = llm.chatJSON;
  const origCheck = security.checkText;
  const calls = [];
  security.checkText = async () => true;
  llm.chatJSON = async (messages) => {
    calls.push(messages);
    if (calls.length === 1) return { display: BAD, state_patch: {} };
    assert.match(messages[1].content, /紧跟自然、准确的简体中文翻译/);
    return { display: '안녕히 가세요（再见）', state_patch: {} };
  };
  try {
    const out = await agent.handleChat({ userId: 'test-repair-json', text: '再见怎么说韩语', channel: 'text' });
    assert.equal(calls.length, 2);
    assert.match(out.display, /再见/);
    assert.doesNotMatch(out.display, /抱歉/);
  } finally {
    llm.chatJSON = origJSON;
    security.checkText = origCheck;
  }
});
