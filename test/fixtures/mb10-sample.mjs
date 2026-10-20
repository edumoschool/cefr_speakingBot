// A real student's answers to Mock Book · Mock 10 (mb10), as speech-to-text
// returned them. Used by the unit tests and by scripts/grade-sample.mjs.
//
// There is no audio, so word timings are rebuilt from the transcript: words are
// spread evenly over `seconds` (the estimated speaking time), "..." adds a 1.5 s
// pause, and words in `unclear` get low ASR confidence. This gives the same
// metrics shape the grader gets in production (lib/metrics.js).
import { buildSteps, getTest } from '../../tgcloud/lib/exam.js';
import { computeMetrics } from '../../tgcloud/lib/metrics.js';

export const TEST_ID = 'mb10';

/** step key → what the student said. An empty transcript = no speech detected. */
export const ANSWERS = {
  p1_1_1: {
    seconds: 27,
    transcript:
      'So I I scroll down and just stay with my family, and we can go to restaurant, a cafe, to have some snacks. ' +
      'And for that, we will go to the park where we can enjoy gain some relaxation activities.',
  },
  p1_1_2: {
    seconds: 26,
    unclear: ['suspicious'], // probably "spacious", misheard by ASR
    transcript:
      'I live in a flat with my family, which is some... Not suspicious. And we have two living rooms, one bathroom, ' +
      'and the kitchen, and a toilet bathroom.',
  },
  p1_1_3: { seconds: 5, transcript: 'Well, I like sci fi and historical movies.' },
  p1_2_1: {
    seconds: 33,
    transcript:
      'This picture describes traveling alone and traveling with family. In the first picture, I can see family, mother, ' +
      "father, and his daughter traveling somewhere in the airport. While I'm taking picture, I can see a girl who's " +
      'traveling around the historical places alone.',
  },
  p1_2_2: {
    seconds: 30,
    transcript:
      'So family traveling has a lot of advantages. First of all, you can rely on your family member while you are ' +
      "struggle to find something or... And it is good to have conversation during travel and taking photos and taking " +
      "videos with them. That's a lot of memory.",
  },
  p1_2_3: {
    seconds: 13,
    transcript: "Well, when it comes to me, I prefer traveling with my family because it's very fun and, uh, and very enjoyable.",
  },
  p2: { seconds: 1, transcript: 'Hello?' },
  p3: { seconds: 0, transcript: '' },
};

function timedWords(text, seconds, unclear = []) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const pauses = tokens.filter((x) => /\.\.\.|…/.test(x)).length;
  const step = Math.max(0.2, (seconds - pauses * 1.5) / Math.max(1, tokens.length));
  const words = [];
  let t = 0.3;
  for (const tok of tokens) {
    const word = tok.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
    if (word) words.push({ word, start: t, end: t + step * 0.8, confidence: unclear.includes(word) ? 0.55 : 0.92 });
    t += step;
    if (/\.\.\.|…/.test(tok)) t += 1.5;
  }
  return words;
}

/** The sample as graded in production: parts in exam order, each with its answered steps. */
export function sampleParts() {
  const parts = [];
  for (const step of buildSteps(getTest(TEST_ID))) {
    const a = ANSWERS[step.key];
    if (!a) continue;
    const metrics = computeMetrics(timedWords(a.transcript, a.seconds, a.unclear), step.speakSec);
    if (parts.at(-1)?.part !== step.part) parts.push({ part: step.part, answers: [] });
    parts.at(-1).answers.push({ step, transcript: a.transcript, metrics });
  }
  return parts;
}
