const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/store');
const agent = require('../src/agent');
const { buildSystemPrompt, buildStreamSystemPrompt } = require('../src/system-prompt');

function newDoc(id = 'isolated-test') {
  return store.defaultUser(id);
}

test('new profiles have an unassessed status and beginner romanization preference', () => {
  const profile = newDoc().profile;
  assert.equal(profile.assessment.status, 'not_assessed');
  assert.equal(profile.assessment.evidence_turns, 0);
  assert.equal(profile.romanization_policy, 'new_words');
});

test('legacy levels are retained as provisional instead of being shown as verified', () => {
  const doc = store.normalize({ userId: 'legacy-test', profile: { level: 'TOPIK1' }, progress: {}, stats: {}, session: {}, messages: [] });
  assert.equal(doc.profile.level, 'TOPIK1');
  assert.equal(doc.profile.assessment.status, 'provisional');
  assert.equal(doc.profile.assessment.source, 'legacy');
});

test('Chinese self-report is stored as provisional and never promoted to assessed level', () => {
  const doc = newDoc();
  agent.applySelfReportedLevel(doc.profile, '我是韩语零基础');
  assert.equal(doc.profile.self_reported_level, 'absolute_beginner');
  assert.equal(doc.profile.assessment.status, 'provisional');
  assert.equal(doc.profile.level, '');
  agent.applyStatePatch(doc, { level: 'TOPIK1', korean_ratio: 0.3 }, { learnerText: '我完全不会韩语' });
  assert.equal(doc.profile.level, '');
});

test('only distinct substantive Korean learner turns count toward assessment', () => {
  const doc = newDoc();
  assert.equal(agent.hasMeaningfulKorean('어쩌다是什么意思'), false);
  assert.equal(agent.hasMeaningfulKorean('저는 학생이에요.'), true);
  assert.equal(agent.recordLearnerEvidence(doc, '저는 학생이에요.'), true);
  doc.messages.push({ role: 'user', content: '저는 학생이에요.' });
  assert.equal(agent.recordLearnerEvidence(doc, '저는 학생이에요'), false);
  assert.equal(doc.profile.assessment.evidence_turns, 1);
});

test('a level patch is ignored until three new Korean samples are available', () => {
  const doc = newDoc();
  doc.profile.assessment.evidence_turns = 2;
  agent.applyStatePatch(doc, { level: 'TOPIK2' }, { learnerText: '저는 학생이에요.' });
  assert.equal(doc.profile.level, '');

  doc.profile.assessment.evidence_turns = 3;
  agent.applyStatePatch(doc, { level: 'TOPIK1', assessment_basis: ['常用现在时句型', '基础词汇'] }, { learnerText: '어제 영화를 봤어요.' });
  assert.equal(doc.profile.level, 'TOPIK1');
  assert.equal(doc.profile.assessment.status, 'assessed');
  assert.equal(doc.profile.assessment.confidence, 'medium');
  assert.equal(doc.profile.assessment.assessed_at_evidence, 3);
});

test('Chinese-only turns cannot add correction or subjective fluency evidence', () => {
  const doc = newDoc();
  agent.applyStatePatch(doc, {
    errors: [{ wrong: '에/에서', right: '에서', point: '助词' }],
    quality: { fluency: 20, naturalness: 20 }
  }, { learnerText: '请告诉我怎么办怎么说' });
  assert.equal(doc.progress.error_log.length, 0);
  assert.equal(doc.progress.quality_log.length, 0);
});

test('slang and etymology questions are routed to web search instead of answered from memory', () => {
  const llm = require('../src/llm');
  assert.equal(llm.needsSearch([{ role: 'user', content: '我在评论里看到“먕글티”，你能说说它的词源吗？' }]), true);
  assert.equal(llm.needsSearch([{ role: 'user', content: '요즘 유행하는 “ㄹㅇ”这个缩略语什么意思？' }]), true);
  assert.equal(llm.needsSearch([{ role: 'user', content: '“怎么办”用韩语怎么说？' }]), false);
});

test('the common beginner request for 怎么办 gets a direct translated expression and syllable romanization', () => {
  const reply = agent.directBeginnerPhraseReply('“怎么办”用韩语怎么说、怎么读？请给我最常用、适合初学者的说法。');
  assert.match(reply.display, /어떡해요\?/);
  assert.match(reply.display, /eo-tteok-hae-yo/);
  assert.match(reply.display, /我该怎么办/);
  assert.equal(agent.directBeginnerPhraseReply('我今天怎么办？'), null);
});

test('untranslated Hangul lines are detected and bilingual lines pass', () => {
  assert.equal(agent.hasUntranslatedKoreanSentence('안녕하세요!'), true);
  assert.equal(agent.hasUntranslatedKoreanSentence('안녕하세요!\n你好！'), false);
  assert.equal(agent.hasUntranslatedKoreanSentence('可以这样说：어떡해요（怎么办？）'), false);
  assert.equal(agent.hasUntranslatedKoreanSentence('“怎么办”在韩语中最常用的说法是 어떡해요。'), true);
});

test('streaming and non-streaming prompts share beginner accuracy and translation rules', () => {
  const doc = newDoc();
  const input = '“怎么办”用韩语怎么说？';
  const standard = buildSystemPrompt(doc, null, '', null, input);
  const streaming = buildStreamSystemPrompt(doc, null, '', null, input);
  for (const required of ['每个韩语句子', '禁止编造词义、词源、发音', '当前有 0 条尚未用于定级']) {
    assert.match(standard, new RegExp(required));
    assert.match(streaming, new RegExp(required));
  }
});
