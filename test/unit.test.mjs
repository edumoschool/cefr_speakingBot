import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { allTests, buildSteps, getTest, modelAnswer, pickTest, publicTest, spokenText } from '../tgcloud/lib/exam.js';
import AUDIO from '../tgcloud/lib/audio-manifest.js';
import { computeMetrics } from '../tgcloud/lib/metrics.js';
import { cefrFromScore, lengthCap, scorePart, totalScore } from '../tgcloud/lib/scoring.js';
import { sampleParts } from './fixtures/mb10-sample.mjs';
import { base64ToBytes, concatBytes, newId, parseRefPayload } from '../tgcloud/lib/util.js';

test('question bank is complete and well formed', () => {
  const tests = allTests();
  assert.equal(tests.length, 34);
  assert.equal(new Set(tests.map((t) => t.id)).size, 34);
  for (const t of tests) {
    assert.equal(t.part1_1.length, 3, t.id);
    assert.equal(t.part1_2.length, 3, t.id);
    assert.equal(t.part1_2_images.length, 2, t.id);
    assert.equal(t.part2.length, 3, t.id);
    assert.ok(t.part3.statement && t.part3.for.length === 3 && t.part3.against.length === 3, t.id);
  }
});

test('steps use official timings and hide model answers', () => {
  const steps = buildSteps(getTest('rb01'));
  assert.deepEqual(steps.map((s) => [s.key, s.prepSec, s.speakSec]), [
    ['p1_1_1', 5, 30], ['p1_1_2', 5, 30], ['p1_1_3', 5, 30],
    ['p1_2_1', 10, 45], ['p1_2_2', 5, 30], ['p1_2_3', 5, 30],
    ['p2', 60, 120], ['p3', 60, 120],
  ]);
  assert.ok(!JSON.stringify(publicTest(getTest('mb03'))).includes('I enjoy spending my free time'));
  assert.ok(modelAnswer(getTest('mb03'), 'p1_1_1').startsWith('I enjoy'));
  assert.ok(modelAnswer(getTest('rb01'), 'p2').length > 500, 'Real Exam tests use the generated samples');
  assert.ok(!JSON.stringify(publicTest(getTest('rb01'))).includes(modelAnswer(getTest('rb01'), 'p2').slice(0, 40)), 'still hidden during a test');
});

test('pickTest prefers untaken tests', () => {
  const ids = allTests().map((t) => t.id);
  assert.equal(pickTest(ids.filter((id) => id !== 'mb07')).id, 'mb07');
  for (let i = 0; i < 50; i++) assert.notEqual(pickTest([...ids, 'rb01']).id, 'rb01');
});

test('base64 decoding matches Node', () => {
  for (const n of [0, 1, 2, 3, 4, 255, 1000]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
    const b64 = Buffer.from(bytes).toString('base64');
    assert.deepEqual(base64ToBytes(b64), bytes);
  }
  assert.throws(() => base64ToBytes('ab$c'));
  assert.deepEqual(concatBytes([Uint8Array.of(1), Uint8Array.of(2, 3)]), Uint8Array.of(1, 2, 3));
  assert.match(newId(), /^[0-9a-f]{32}$/);
  assert.equal(parseRefPayload('ref_42'), 42);
  assert.equal(parseRefPayload('ref_x'), undefined);
});

test('computeMetrics: pace, pauses, fillers', () => {
  const m = computeMetrics([
    { word: 'i', start: 0, end: 0.2, confidence: 0.99 },
    { word: 'um', start: 0.3, end: 0.5, confidence: 0.9 },
    { word: 'think', start: 2.0, end: 2.3, confidence: 0.95 },
    { word: 'so', start: 5.0, end: 5.2, confidence: 0.4 },
  ], 30);
  assert.deepEqual([m.wordCount, m.fillers, m.pauses, m.longPauses, m.speakingTime], [3, 1, 2, 1, 5.2]);
});

test('CEFR bands and calibrated scoring', () => {
  assert.deepEqual([37, 38, 50, 51, 64, 65, 75].map(cefrFromScore), ['Below B1', 'B1', 'B1', 'B2', 'B2', 'C1', 'C1']);
  const uniform = (l) => Object.fromEntries(['fluency_coherence', 'lexical_resource', 'grammar', 'pronunciation', 'task_response'].map((c) => [c, l]));
  const all = (l) => totalScore(['1.1', '1.2', '2', '3'].map((part) => ({ part, ...scorePart(uniform(l), 1000, 60) })));
  assert.equal(all('A2').level, 'Below B1');
  assert.equal(all('B1-').level, 'B1');
  assert.equal(all('B1').level, 'B1');
  assert.equal(all('B2-').level, 'B2');
  assert.equal(all('B2').level, 'B2');
  assert.equal(all('C1').level, 'C1');
  assert.equal(all('C1+').score, 75);
});

test('short answers cap fluency and task response; silence scores zero', () => {
  const c1 = Object.fromEntries(['fluency_coherence', 'lexical_resource', 'grammar', 'pronunciation', 'task_response'].map((c) => [c, 'C1']));
  const p = scorePart(c1, 3, 120);
  assert.equal(p.criteria.fluency_coherence, 'A1');
  assert.equal(p.criteria.task_response, 'A1');
  assert.equal(p.criteria.grammar, 'B1', 'a far too short answer caps the other criteria too');
  assert.equal(scorePart(c1, 0, 120).points, 0);
  assert.equal(scorePart(null, 50, 30).points, 0);
  assert.equal(lengthCap(0, 30), 'none');
});

test('one harsh grammar or fluency label cannot sink a good answer', () => {
  const p = scorePart({ fluency_coherence: 'B1-', lexical_resource: 'B2', grammar: 'A2', pronunciation: 'B2', task_response: 'B2' }, 1000, 60);
  assert.equal(p.criteria.grammar, 'B1+', 'pulled up to 2 sub-levels below the median (B2)');
  assert.equal(p.criteria.fluency_coherence, 'B1+');
  assert.equal(cefrFromScore(p.points), 'B2');
});

test('no overgrading: inflated outliers, ASR-guessed pronunciation and off-topic answers', () => {
  const lifted = scorePart({ fluency_coherence: 'B1', lexical_resource: 'C1+', grammar: 'B1', pronunciation: 'C1', task_response: 'B1' }, 1000, 60);
  assert.equal(lifted.criteria.lexical_resource, 'B2-', 'a few fancy words do not make C1');
  assert.equal(lifted.criteria.pronunciation, 'B1+', 'pronunciation stays within one sub-level');
  const offTopic = scorePart({ fluency_coherence: 'B2', lexical_resource: 'B2', grammar: 'B2', pronunciation: 'B2', task_response: 'A2' }, 1000, 60);
  assert.equal(offTopic.criteria.task_response, 'A2', 'task response is never lifted');
  assert.ok(['fluency_coherence', 'lexical_resource', 'grammar', 'pronunciation'].every((c) => offTopic.criteria[c] === 'B1'));
  assert.equal(cefrFromScore(offTopic.points), 'B1');
});

test('sample mb10: good Part 1 answers but Parts 2 and 3 empty stay below B1', () => {
  const sample = sampleParts();
  assert.deepEqual(sample.map((p) => p.part), ['1.1', '1.2', '2', '3']);
  // Labels a lenient examiner could give this student; Part 2 was only "Hello?", Part 3 silence.
  const labels = {
    '1.1': { fluency_coherence: 'B1', lexical_resource: 'B1', grammar: 'A2', pronunciation: 'B1', task_response: 'B1+' },
    '1.2': { fluency_coherence: 'B1+', lexical_resource: 'B1', grammar: 'B1-', pronunciation: 'B1', task_response: 'B1+' },
    '2': { fluency_coherence: 'A1', lexical_resource: 'A1', grammar: 'A1', pronunciation: 'B1', task_response: 'A1' },
    '3': null,
  };
  const parts = sample.map(({ part, answers }) => {
    const words = answers.reduce((s, a) => s + a.metrics.wordCount, 0);
    const allowed = answers.reduce((s, a) => s + a.step.speakSec, 0);
    return { part, words, ...scorePart(labels[part], words, allowed) };
  });
  const by = Object.fromEntries(parts.map((p) => [p.part, p]));
  assert.equal(by['1.2'].criteria.fluency_coherence, 'B1+', 'Part 1.2 is long enough: no length cap');
  assert.equal(by['2'].words, 1);
  assert.equal(by['2'].criteria.pronunciation, 'A2', 'one word cannot earn B1 pronunciation');
  assert.equal(by['3'].points, 0);
  const total = totalScore(parts);
  assert.equal(total.level, 'Below B1');
  assert.ok(total.score >= 20 && total.score < 38, `score ${total.score}`);
});

// Active once scripts/generate-audio.mjs has filled the manifest.
test('every question has an examiner clip that exists in public/audio', { skip: Object.keys(AUDIO).length === 0 && 'audio not generated yet' }, () => {
  for (const t of allTests()) {
    for (const step of publicTest(t).steps) {
      assert.ok(step.audio, `${t.id} ${step.key} has no clip for: ${spokenText(step)}`);
      assert.ok(existsSync(`public${step.audio}`), `missing file public${step.audio}`);
    }
  }
  assert.equal(Object.keys(AUDIO).length, new Set(allTests().flatMap((t) => buildSteps(t).map(spokenText))).size);
});
