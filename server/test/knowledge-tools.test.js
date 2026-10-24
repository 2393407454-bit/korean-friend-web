const test = require('node:test');
const assert = require('node:assert/strict');
const knowledge = require('../src/knowledge');
const tools = require('../src/tools');

/* ===== RAG 知识库检索（关键词模式，不依赖网络） ===== */
test('knowledge keyword search finds the 은/는 vs 이/가 entry', async () => {
  const { mode, results } = await knowledge.search('은/는 和 이/가 有什么区别', { topK: 4 });
  assert.equal(mode, 'keyword');
  assert.ok(results.length >= 1);
  const ids = results.map((r) => r.id);
  assert.ok(ids.includes('g-eun-neun') || ids.includes('g-i-ga'), '应命中主格/主题助词条目，实际：' + ids.join(','));
});

test('knowledge keyword search finds pronunciation rules', async () => {
  const { results } = await knowledge.search('紧音化 학교 发音', { topK: 3 });
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, 'p-geongeumhwa');
});

test('knowledge keyword search finds exam entries', async () => {
  const { results } = await knowledge.search('TOPIK 写作 53题 怎么写', { topK: 3 });
  assert.ok(results.some((r) => r.category === 'exam'));
});

test('knowledge search handles empty and unmatched queries safely', async () => {
  const empty = await knowledge.search('', { topK: 3 });
  assert.deepEqual(empty.results, []);
  const none = await knowledge.search('zzzzqqqq 完全无关的内容', { topK: 3 });
  assert.ok(none.results.length === 0 || none.results.every((r) => r.mode === 'keyword'));
});

test('knowledge corpus is well-formed', () => {
  const { CORPUS } = require('../src/data/knowledge');
  assert.ok(CORPUS.length >= 60, '语料应不少于 60 条，实际 ' + CORPUS.length);
  const seen = new Set();
  for (const c of CORPUS) {
    assert.ok(c.id && !seen.has(c.id), '条目 id 重复或缺失：' + c.id);
    seen.add(c.id);
    assert.ok(c.title && c.text && c.text.length >= 60, '条目内容过短：' + c.id);
    assert.ok(Array.isArray(c.tags) && c.tags.length >= 2, '条目标签缺失：' + c.id);
    assert.ok(['grammar', 'pronunciation', 'vocab', 'culture', 'exam', 'life'].includes(c.category), '非法分类：' + c.id);
  }
});

/* ===== Function Calling 工具集 ===== */
test('function tool defs follow OpenAI schema', () => {
  const defs = tools.getFunctionDefs();
  assert.ok(defs.length >= 3);
  for (const d of defs) {
    assert.equal(d.type, 'function');
    assert.ok(d.function.name && d.function.description);
    assert.equal(typeof d.function.parameters, 'object');
  }
  const names = defs.map((d) => d.function.name);
  assert.ok(names.includes('search_knowledge'));
  assert.ok(names.includes('search_songs'));
  assert.ok(names.includes('lookup_vocab'));
});

test('search_songs executor finds verified lyrics by title and keyword', async () => {
  const byEn = await tools.executeCall(
    { function: { name: 'search_songs', arguments: JSON.stringify({ query: 'spring day' }) } },
    { doc: {} }
  );
  assert.equal(byEn.ok, true);
  const data = JSON.parse(byEn.result);
  assert.equal(data.found, true);
  assert.ok(data.songs[0].title === '봄날');
  assert.ok(data.songs[0].verified_lines.length >= 1);

  const byArtist = await tools.executeCall(
    { function: { name: 'search_songs', arguments: JSON.stringify({ query: '아이유' }) } },
    { doc: {} }
  );
  const data2 = JSON.parse(byArtist.result);
  assert.equal(data2.found, true);

  const miss = await tools.executeCall(
    { function: { name: 'search_songs', arguments: JSON.stringify({ query: '존재하지 않는 노래' }) } },
    { doc: {} }
  );
  const data3 = JSON.parse(miss.result);
  assert.equal(data3.found, false, '未收录歌曲应返回 found=false 防止编造');
});

test('lookup_vocab executor reads the user vocab book', async () => {
  const doc = {
    progress: {
      vocab: [
        { ko: '학생', zh: '学生', seen: 2, srs_stage: 2, due_at: new Date(Date.now() - 86400000).toISOString() },
        { ko: '커피', zh: '咖啡', seen: 1, srs_stage: 1, due_at: new Date(Date.now() + 86400000).toISOString() }
      ],
      error_log: [{ wrong: '학생 이에요', right: '학생이에요', point: '隔写法', count: 2 }],
      weak_points: ['松紧音']
    }
  };
  const out = await tools.executeCall(
    { function: { name: 'lookup_vocab', arguments: JSON.stringify({ word: '학생' }) } },
    { doc }
  );
  assert.equal(out.ok, true);
  const data = JSON.parse(out.result);
  assert.equal(data.vocab_total, 2);
  assert.equal(data.due_count, 1);
  assert.equal(data.matched[0].ko, '학생');
  assert.equal(data.repeat_errors[0].point, '隔写法');
});

test('search_knowledge executor returns corpus text in keyword mode', async () => {
  const out = await tools.executeCall(
    { function: { name: 'search_knowledge', arguments: JSON.stringify({ query: '连音 규칙' }) } },
    { doc: {} }
  );
  assert.equal(out.ok, true);
  const data = JSON.parse(out.result);
  assert.ok(data.results.length >= 1);
  assert.ok(data.results[0].text.length > 40);
});

test('unknown tool and broken arguments degrade safely', async () => {
  const unknown = await tools.executeCall({ function: { name: 'nope', arguments: '{}' } }, { doc: {} });
  assert.equal(unknown.ok, false);
  const broken = await tools.executeCall(
    { function: { name: 'search_songs', arguments: '{not json' } },
    { doc: {} }
  );
  assert.equal(broken.ok, true, '坏参数不应让工具链崩溃');
});

test('shouldUse gates tools to learning-intent messages', () => {
  assert.equal(tools.shouldUse('은和는有什么区别？'), true);
  assert.equal(tools.shouldUse('最近有什么新歌？'), false, '时效性问题交给联网搜索链路');
  assert.equal(tools.shouldUse('你好呀，今天心情不错'), false);
  assert.equal(tools.shouldUse('TOPIK 怎么备考？'), true);
});
