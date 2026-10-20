// Grades the sample answers in test/fixtures/mb10-sample.mjs with the real
// OpenAI model from .env, the same way finish_mock does, and prints the result.
//
//   npm run grade:sample                 feedback in English
//   npm run grade:sample -- --lang uz    feedback in Uzbek (or ru)
//
// Costs one OpenAI call per part plus one for the summary.
import { gradePart, summarize } from '../tgcloud/lib/grading.js';
import { CRITERIA, scorePart, totalScore } from '../tgcloud/lib/scoring.js';
import { ENV } from '../tgcloud/lib/env.js';
import { sampleParts, TEST_ID } from '../test/fixtures/mb10-sample.mjs';

const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'en';
if (!ENV.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is empty: set it in .env, then run `npm run env`.');
  process.exit(1);
}

console.log(`Grading sample ${TEST_ID} with ${ENV.OPENAI_MODEL} (feedback: ${lang})\n`);
const parts = [];
for (const { part, answers } of sampleParts()) {
  const llm = await gradePart(part, answers, lang);
  const words = answers.reduce((s, a) => s + a.metrics.wordCount, 0);
  const allowed = answers.reduce((s, a) => s + a.step.speakSec, 0);
  const { criteria, points } = scorePart(llm, words, allowed);
  parts.push({ part, criteria, points, words, feedback: llm.feedback, llm });

  console.log(`Part ${part}: ${words} words in ${allowed}s allowed → ${points}/75`);
  for (const c of CRITERIA) {
    const changed = llm[c] !== criteria[c] ? `  (model said ${llm[c]})` : '';
    console.log(`  ${c.padEnd(18)} ${criteria[c]}${changed}`);
  }
  console.log(`  ${llm.feedback}\n`);
}

const total = totalScore(parts);
const summary = await summarize(parts, total.score, total.level, lang);
console.log(`TOTAL ${total.score}/75 · ${total.level}`);
console.log(`Skills: ${CRITERIA.map((c) => `${c} ${total.criteria[c]}`).join(', ')}\n`);
console.log(summary.overall_feedback);
if (summary.priorities.length) console.log(`\nImprove first:\n${summary.priorities.map((p) => `- ${p}`).join('\n')}`);
const fixes = parts.flatMap((p) => p.llm.corrections);
if (fixes.length) console.log(`\nMistakes worth fixing:\n${fixes.map((f) => `- "${f.original}" → "${f.corrected}"`).join('\n')}`);
