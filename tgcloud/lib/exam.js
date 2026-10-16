// Exam structure: turns a question-bank entry into the timed steps the Mini App runs.
// Pure module (no sdk imports) so it can be unit-tested in Node.
import QUESTIONS from './questions.js';
import AUDIO from './audio-manifest.js';
import SAMPLES from './samples.js';

/** Official Multilevel timings (seconds). */
export const TIMING = {
  p11: { prep: 5, speak: 30 },
  p12first: { prep: 10, speak: 45 },
  p12: { prep: 5, speak: 30 },
  p2: { prep: 60, speak: 120 },
  p3: { prep: 60, speak: 120 },
};

export const PARTS = ['1.1', '1.2', '2', '3'];

export function allTests() {
  return QUESTIONS;
}

export function getTest(id) {
  return QUESTIONS.find((t) => t.id === id);
}

export function buildSteps(t) {
  const img = (f) => `/img/${f}`;
  const steps = [];
  t.part1_1.forEach((q, i) =>
    steps.push({ key: `p1_1_${i + 1}`, part: '1.1', question: q, prepSec: TIMING.p11.prep, speakSec: TIMING.p11.speak }),
  );
  t.part1_2.forEach((q, i) => {
    const timing = i === 0 ? TIMING.p12first : TIMING.p12;
    steps.push({ key: `p1_2_${i + 1}`, part: '1.2', question: q, prepSec: timing.prep, speakSec: timing.speak, images: t.part1_2_images.map(img) });
  });
  steps.push({
    key: 'p2', part: '2', question: t.part2[0], bullets: t.part2,
    images: t.part2_image ? [img(t.part2_image)] : undefined,
    prepSec: TIMING.p2.prep, speakSec: TIMING.p2.speak,
  });
  steps.push({ key: 'p3', part: '3', question: t.part3.statement, table: t.part3, prepSec: TIMING.p3.prep, speakSec: TIMING.p3.speak });
  return steps;
}

/** The steps of a session: the whole test for a mock, one part for a drill. */
export function sessionSteps(session) {
  const steps = buildSteps(getTest(session.test_id));
  return session.kind === 'drill' ? steps.filter((s) => s.part === session.drill_part) : steps;
}

export function sessionParts(session) {
  return session.kind === 'drill' ? [session.drill_part] : PARTS;
}

/** What the examiner says for a step (also the key of the pre-generated audio). */
export function spokenText(step) {
  if (step.part === '2') return `Part 2. ${(step.bullets ?? []).join(' ')}`;
  if (step.part === '3') return `Part 3. Look at the statement: ${step.table.statement} Use the arguments for and against.`;
  return step.question;
}

/** The test as sent to the Mini App (no model answers), with the examiner's voice clip per step. */
export function publicTest(t, part) {
  const steps = buildSteps(t).filter((s) => !part || s.part === part).map((s) => {
    const file = AUDIO[spokenText(s)];
    return file ? { ...s, audio: `/audio/${file}` } : s;
  });
  return { id: t.id, title: part ? `Part ${part} drill · ${t.title}` : t.title, topics: t.topics, steps };
}

/** Picks a test the user hasn't taken; once all are used, a least-taken one. */
export function pickTest(taken, rand = Math.random) {
  const counts = new Map();
  for (const id of taken) counts.set(id, (counts.get(id) ?? 0) + 1);
  const min = Math.min(...QUESTIONS.map((t) => counts.get(t.id) ?? 0));
  const pool = QUESTIONS.filter((t) => (counts.get(t.id) ?? 0) === min);
  return pool[Math.floor(rand() * pool.length)];
}

/** Sample answers of a test: the Mock Book's own, else the generated ones (samples.js). */
function samplesOf(t) {
  return t.model ?? SAMPLES[t.id] ?? null;
}

/** Where a test's sample answers come from: 'book' (Mock Book), 'ai' (generated) or null. */
export function sampleSource(t) {
  return t.model ? 'book' : SAMPLES[t.id] ? 'ai' : null;
}

export function modelAnswer(t, key) {
  const model = samplesOf(t);
  if (!model) return null;
  const m = /^p1_(1|2)_(\d+)$/.exec(key);
  if (m) return (m[1] === '1' ? model.part1_1 : model.part1_2)?.[Number(m[2]) - 1] || null;
  if (key === 'p2') return model.part2 || null;
  if (key === 'p3') return model.part3 || null;
  return null;
}

/** For "Questions & sample answers": the list of tests, or one test with its sample answers. */
export function libraryList() {
  return QUESTIONS.map((t) => ({ id: t.id, title: t.title, topics: t.topics, samples: sampleSource(t) }));
}

export function libraryTest(t) {
  const view = publicTest(t);
  return { ...view, samples: sampleSource(t), steps: view.steps.map((s) => ({ ...s, sample: modelAnswer(t, s.key) })) };
}
