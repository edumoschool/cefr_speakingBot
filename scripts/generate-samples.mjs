// Writes sample answers for the tests whose source PDF has none (the Real Exam
// sets) into tgcloud/lib/samples.js. Run once, on your computer, when questions
// change: `node scripts/generate-samples.mjs` (reads OPENAI_API_KEY from the
// environment or .env). The Mock Book's own model answers are never replaced.
// Pictures are sent too, so "What do you see in these pictures?" is answered
// from the real exam pictures.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import QUESTIONS from '../tgcloud/lib/questions.js';

const OUT = 'tgcloud/lib/samples.js';
const MODEL = process.env.SAMPLES_MODEL || 'gpt-5.4-mini';
const key = process.env.OPENAI_API_KEY || (existsSync('.env') && /^OPENAI_API_KEY=(.*)$/m.exec(readFileSync('.env', 'utf8'))?.[1]?.trim().replace(/^["']|["']$/g, ''));
if (!key) throw new Error('Set OPENAI_API_KEY (environment or .env)');

const existing = existsSync(OUT) ? (await import(`../${OUT}?t=${Date.now()}`)).default : {};
const todo = QUESTIONS.filter((t) => !t.model && !existing[t.id]);
console.log(`${todo.length} tests need sample answers`);

const str = { type: 'string' };
const three = { type: 'array', items: str, minItems: 3, maxItems: 3 };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['part1_1', 'part1_2', 'part2', 'part3'],
  properties: { part1_1: three, part1_2: three, part2: str, part3: str },
};

const SYSTEM = `You write model answers for the Uzbekistan CEFR Multilevel speaking exam, to help students prepare.
Write what a confident C1 candidate would SAY: natural spoken English, first person, clear structure, varied but not showy vocabulary, no headings or bullet points, no stage directions.
Lengths (they must fit the speaking time; count your words — answers that are too short are rejected):
- Part 1.1 (30 s each): 60–75 words, a direct answer then a reason or example.
- Part 1.2: answer 1 (45 s) describes and compares the two pictures in 80–95 words — describe only what is really in them; answers 2 and 3 (30 s): 65–80 words.
- Part 2 (2 min): 230–260 words covering every question on the card, in order, with a personal story or concrete detail.
- Part 3 (2 min): 250–280 words: introduce the statement, discuss arguments from BOTH lists in your own words, then give and justify your own opinion.`;

const toDataUrl = (file) => `data:image/jpeg;base64,${readFileSync(`public/img/${file}`).toString('base64')}`;

async function generate(t) {
  const content = [
    {
      type: 'text',
      text: JSON.stringify({
        part1_1: t.part1_1,
        part1_2: t.part1_2,
        part2_card: t.part2,
        part3: t.part3,
        note: 'The first image(s) are the two Part 1.2 pictures; the last one, if any, is the Part 2 picture.',
      }),
    },
    ...t.part1_2_images.map((f) => ({ type: 'image_url', image_url: { url: toDataUrl(f), detail: 'low' } })),
    ...(t.part2_image ? [{ type: 'image_url', image_url: { url: toDataUrl(t.part2_image), detail: 'low' } }] : []),
  ];
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content }];
  let best = null;
  for (let round = 1; round <= 3; round++) {
    const reply = await ask(t, messages);
    const short = tooShort(reply);
    if (!best || short.length < tooShort(best).length) best = reply;
    if (!short.length) return reply;
    // Models tend to write short: send it back once or twice to be lengthened.
    messages.push({ role: 'assistant', content: JSON.stringify(reply) });
    messages.push({ role: 'user', content: `Too short: ${short.join('; ')}. Rewrite ALL answers so each reaches its word range, keeping the same ideas.` });
  }
  console.warn(`  ${t.id}: still short after 3 rounds (${tooShort(best).join('; ')})`);
  return best;
}

const MIN_WORDS = { part1_1: 55, part1_2: [75, 60, 60], part2: 220, part3: 240 };
const words = (s) => s.trim().split(/\s+/).length;
function tooShort(r) {
  const out = [];
  r.part1_1.forEach((a, i) => words(a) < MIN_WORDS.part1_1 && out.push(`part1_1[${i}] ${words(a)}/${MIN_WORDS.part1_1}`));
  r.part1_2.forEach((a, i) => words(a) < MIN_WORDS.part1_2[i] && out.push(`part1_2[${i}] ${words(a)}/${MIN_WORDS.part1_2[i]}`));
  if (words(r.part2) < MIN_WORDS.part2) out.push(`part2 ${words(r.part2)}/${MIN_WORDS.part2}`);
  if (words(r.part3) < MIN_WORDS.part3) out.push(`part3 ${words(r.part3)}/${MIN_WORDS.part3}`);
  return out;
}

async function ask(t, messages) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: 'json_schema', json_schema: { name: 'samples', strict: true, schema: SCHEMA } },
      }),
    });
    if (res.ok) return JSON.parse((await res.json()).choices[0].message.content);
    const text = await res.text();
    if (attempt >= 3 || res.status < 500) throw new Error(`${t.id}: OpenAI ${res.status} ${text.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const out = { ...existing };
const queue = [...todo];
await Promise.all(
  Array.from({ length: 5 }, async () => {
    for (let t; (t = queue.shift()); ) {
      out[t.id] = await generate(t);
      console.log('✔', t.id);
    }
  }),
);

const sorted = Object.fromEntries(QUESTIONS.filter((t) => out[t.id]).map((t) => [t.id, out[t.id]]));
writeFileSync(
  OUT,
  `// GENERATED by scripts/generate-samples.mjs — sample answers (AI-written, C1 level) for the\n` +
    `// tests whose source PDF has no model answers. The Mock Book's own answers live in questions.js.\n` +
    `export default ${JSON.stringify(sorted, null, 1)};\n`,
);
console.log(`wrote ${OUT} (${Object.keys(sorted).length} tests)`);
