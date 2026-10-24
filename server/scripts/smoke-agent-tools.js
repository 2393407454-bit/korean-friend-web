// Agent 工具链路冒烟脚本（真实 API，不入测试套件）：
//   node scripts/smoke-agent-tools.js
// 验证三件事：
//   1) RAG 检索（向量或关键词模式）能命中知识库；
//   2) GLM function calling 工具循环能自主调用 search_knowledge 并生成最终回复；
//   3) 流式工具链路不向前端泄漏工具帧、产出正文。
require('dotenv').config();
const knowledge = require('../src/knowledge');
const llm = require('../src/llm');
const tools = require('../src/tools');

async function main() {
  console.log('=== 1) RAG 检索 ===');
  console.log('status:', JSON.stringify(knowledge.status()));
  const hit = await knowledge.search('은/는 和 이/가 有什么区别', { topK: 2 });
  console.log('检索模式:', hit.mode, '命中:', hit.results.map((r) => r.title).join(' | '));

  console.log('\n=== 2) 知识库向量索引（有 Key 时后台建一次） ===');
  if (process.env.LLM_API_KEY) {
    try {
      const idx = await knowledge.buildIndex();
      console.log('索引构建成功:', idx.items.length, '条 ·', idx.model, idx.dim + '维');
      const vec = await knowledge.search('紧音化 是什么', { topK: 2 });
      console.log('向量检索模式:', vec.mode, '命中:', vec.results.map((r) => r.title + '(' + r.score + ')').join(' | '));
    } catch (e) {
      console.warn('索引构建失败（保持关键词模式）:', e.message);
    }
  } else {
    console.log('未配置 LLM_API_KEY，跳过向量索引');
  }

  console.log('\n=== 3) Function Calling 工具循环（非流式） ===');
  const doc = { progress: { vocab: [{ ko: '학생', zh: '学生', seen: 2 }], error_log: [], weak_points: [] } };
  const events = [];
  const out = await llm.chatJSONWithTools(
    [
      { role: 'system', content: '你是韩语老师。收到 search_knowledge 结果后，基于它用中韩双语简短回答；结尾以 { 完整 JSON } 输出，包含 speech/display/state_patch/ui_hints 字段。' },
      { role: 'user', content: '은/는 和 이/가 到底怎么区分？给两个例句。' }
    ],
    { doc },
    { onToolEvent: (e) => events.push(e) }
  );
  console.log('工具事件:', events.map((e) => e.name + '(' + (e.ok ? 'ok' : 'fail') + ')').join(' → ') || '（模型未调用工具）');
  console.log('回复 display 前 120 字:', String(out.display || '').slice(0, 120).replace(/\n/g, ' '));

  console.log('\n=== 4) 流式工具链路 ===');
  let streamed = '';
  const streamEvents = [];
  const full = await llm.chatStream(
    [
      { role: 'system', content: '你是韩语老师。需要资料时调用工具，回答保持简短。' },
      { role: 'user', content: '学生生词本里有哪些词？顺便说一个该复习的。' }
    ],
    {
      maxTokens: 400,
      tools: tools.getFunctionDefs(),
      ctx: { doc },
      onDelta: (d) => { streamed += d; },
      onToolEvent: (e) => streamEvents.push(e)
    }
  );
  console.log('工具事件:', streamEvents.map((e) => e.name).join(' → ') || '（无）');
  console.log('流式正文前 120 字:', String(full || streamed).slice(0, 120).replace(/\n/g, ' '));
  console.log('\nSMOKE OK');
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
