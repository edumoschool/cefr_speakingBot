import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { cefrFromScore, lengthCap, scoreAssessment, type LlmResult, type AnswerInput } from '../lib/assess.js';
import { computeMetrics } from '../lib/speech.js';
import { parseRefPayload, verifyInitData } from '../lib/telegram.js';
import { allTests, buildSteps, getTest, modelAnswer, pickTest } from '../lib/tests.js';

const TOKEN = '123456:TEST-token';

function signInitData(fields: Record<string, string>, token = TOKEN) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('verifyInitData accepts a correctly signed payload', () => {
  const now = Math.floor(Date.now() / 1000);
  const raw = signInitData({ auth_date: String(now), user: JSON.stringify({ id: 42, first_name: 'Ali' }), start_param: 'ref_7' });
  const d = verifyInitData(raw, TOKEN);
  assert.equal(d?.user.id, 42);
  assert.equal(d?.startParam, 'ref_7');
});

test('verifyInitData rejects tampering, wrong token and stale data', () => {
  const now = Math.floor(Date.now() / 1000);
  const raw = signInitData({ auth_date: String(now), user: JSON.stringify({ id: 42 }) });
  assert.equal(verifyInitData(raw.replace('42', '43'), TOKEN), null);
  assert.equal(verifyInitData(raw, '999:other'), null);
  const old = signInitData({ auth_date: String(now - 3 * 86400), user: JSON.stringify({ id: 42 }) });
  assert.equal(verifyInitData(old, TOKEN), null);
  assert.equal(verifyInitData('', TOKEN), null);
});

test('parseRefPayload', () => {
  assert.equal(parseRefPayload('ref_123'), 123);
  assert.equal(parseRefPayload('ref_abc'), undefined);
  assert.equal(parseRefPayload(undefined), undefined);
});

test('question bank is complete and well formed', () => {
  const tests = allTests();
  assert.equal(tests.length, 34);
  assert.equal(new Set(tests.map((t) => t.id)).size, tests.length);
  for (const t of tests) {
    assert.ok(t.part1_1.length >= 3, t.id);
    assert.equal(t.part1_2.length, 3, t.id);
    assert.equal(t.part1_2_images.length, 2, t.id);
    assert.equal(t.part2.length, 3, t.id);
    assert.ok(t.part3.statement && t.part3.for.length >= 3 && t.part3.against.length >= 3, t.id);
    const steps = buildSteps(t);
    assert.equal(steps.length, t.part1_1.length + 5);
    assert.equal(steps.at(-1)!.key, 'p3');
  }
});

test('buildSteps uses official timings', () => {
  const steps = buildSteps(getTest('rb01')!);
  assert.deepEqual(steps.map((s) => [s.key, s.prepSec, s.speakSec]), [
    ['p1_1_1', 5, 30], ['p1_1_2', 5, 30], ['p1_1_3', 5, 30],
    ['p1_2_1', 10, 45], ['p1_2_2', 5, 30], ['p1_2_3', 5, 30],
    ['p2', 60, 120], ['p3', 60, 120],
  ]);
});

test('pickTest avoids tests already taken', () => {
  const all = allTests().map((t) => t.id);
  const taken = all.filter((id) => id !== 'mb07');
  assert.equal(pickTest(taken).id, 'mb07');
  // all taken once -> any; one taken twice -> never that one
  for (let i = 0; i < 50; i++) assert.notEqual(pickTest([...all, 'rb01']).id, 'rb01');
});

test('modelAnswer exists only for the mock book', () => {
  assert.ok(modelAnswer(getTest('mb03')!, 'p1_1_1')!.startsWith('I enjoy'));
  assert.ok(modelAnswer(getTest('mb03')!, 'p3'));
  assert.equal(modelAnswer(getTest('rb01')!, 'p2'), undefined);
});

test('computeMetrics measures pace, pauses and fillers', () => {
  const words = [
    { word: 'i', start: 0, end: 0.2, confidence: 0.99 },
    { word: 'um', start: 0.3, end: 0.5, confidence: 0.9 },
    { word: 'think', start: 2.0, end: 2.3, confidence: 0.95 },
    { word: 'so', start: 5.0, end: 5.2, confidence: 0.4 },
  ];
  const m = computeMetrics(words, 30);
  assert.equal(m.wordCount, 3);
  assert.equal(m.fillers, 1);
  assert.equal(m.pauses, 2);
  assert.equal(m.longPauses, 1);
  assert.equal(m.speakingTime, 5.2);
  assert.equal(m.wpm, Math.round((3 / 5.2) * 60));
  assert.deepEqual(computeMetrics([], 30).wordCount, 0);
});

test('CEFR bands match the Multilevel scale', () => {
  assert.equal(cefrFromScore(37), 'Below B1');
  assert.equal(cefrFromScore(38), 'B1');
  assert.equal(cefrFromScore(50), 'B1');
  assert.equal(cefrFromScore(51), 'B2');
  assert.equal(cefrFromScore(64), 'B2');
  assert.equal(cefrFromScore(65), 'C1');
  assert.equal(cefrFromScore(75), 'C1');
});

function fakeAnswers(wordsPerAnswer: number): AnswerInput[] {
  return buildSteps(getTest('rb01')!).map((step) => ({
    step,
    transcript: 'x',
    metrics: { ...computeMetrics([], step.speakSec), wordCount: wordsPerAnswer },
  }));
}

function uniformLlm(level: any): LlmResult {
  return {
    parts: (['1.1', '1.2', '2', '3'] as const).map((part) => ({
      part, fluency_coherence: level, lexical_resource: level, grammar: level, pronunciation: level, task_response: level, feedback: '',
    })),
    steps: [], overall_feedback: '', strengths: [], priorities: [], corrections: [], vocabulary_upgrades: [], pronunciation_tips: [],
  };
}

test('uniform CEFR labels land in the matching band', () => {
  const full = fakeAnswers(400);
  assert.equal(scoreAssessment(uniformLlm('A2'), full).level, 'Below B1');
  assert.equal(scoreAssessment(uniformLlm('B1'), full).level, 'B1');
  assert.equal(scoreAssessment(uniformLlm('B1-'), full).level, 'B1');
  assert.equal(scoreAssessment(uniformLlm('B2'), full).level, 'B2');
  assert.equal(scoreAssessment(uniformLlm('B2-'), full).level, 'B2');
  assert.equal(scoreAssessment(uniformLlm('C1'), full).level, 'C1');
  assert.equal(scoreAssessment(uniformLlm('C1+'), full).score, 75);
});

test('very short answers cap fluency and task response', () => {
  const a = scoreAssessment(uniformLlm('C1'), fakeAnswers(3));
  for (const p of a.parts) {
    assert.equal(p.criteria.fluency_coherence, 'A1');
    assert.equal(p.criteria.task_response, 'A1');
    assert.equal(p.criteria.grammar, 'C1');
  }
  assert.ok(a.score < 51);
  assert.equal(lengthCap(0, 30), 'none');
});

test('missing parts score zero', () => {
  const only11 = fakeAnswers(400).filter((a) => a.step.part === '1.1');
  const a = scoreAssessment(uniformLlm('C1'), only11);
  assert.equal(a.parts.find((p) => p.part === '3')!.points, 0);
  assert.equal(a.score, Math.round(71 * 0.2));
});
