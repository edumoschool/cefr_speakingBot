// Turns .env into tgcloud/lib/env.js, the module the bot reads its settings from.
// Telegram Serverless has no environment variables at runtime, so the values are
// shipped as a (git-ignored) module with the deploy. Run automatically by
// `npm run deploy` (with --strict), `npm test` and `npm run dev:api`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const strict = process.argv.includes('--strict');
// Tests only need the module to exist (they supply their own values): never write real keys for them.
if (process.argv.includes('--if-missing') && existsSync('tgcloud/lib/env.js')) process.exit(0);
const placeholder = process.argv.includes('--if-missing');
const file = '.env';

const vars = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    vars[m[1]] = v;
  }
}
const get = (k, d = '') => (placeholder ? d : process.env[k] ?? vars[k] ?? d);

const env = {
  OPENAI_API_KEY: get('OPENAI_API_KEY'),
  OPENAI_MODEL: get('OPENAI_MODEL', 'gpt-5.4-mini'),
  TRANSCRIBER: get('TRANSCRIBER', 'deepgram').toLowerCase(),
  DEEPGRAM_API_KEY: get('DEEPGRAM_API_KEY'),
  DEEPGRAM_MODEL: get('DEEPGRAM_MODEL', 'nova-3'),
  ELEVENLABS_API_KEY: get('ELEVENLABS_API_KEY'),
  ELEVENLABS_MODEL: get('ELEVENLABS_MODEL', 'scribe_v2'),
  CHANNEL_ID: get('CHANNEL_ID'),
  CHANNEL_URL: get('CHANNEL_URL'),
  ADMIN_IDS: get('ADMIN_IDS').split(',').map((s) => Number(s.trim())).filter(Boolean),
  SUPPORT_CONTACT: get('SUPPORT_CONTACT'),
  APP_URL: get('APP_URL') ? get('APP_URL').replace(/\/+$/, '') + '/' : '',
};
if (!env.CHANNEL_URL && env.CHANNEL_ID.startsWith('@')) env.CHANNEL_URL = `https://t.me/${env.CHANNEL_ID.slice(1)}`;

const problems = [];
if (!['deepgram', 'elevenlabs'].includes(env.TRANSCRIBER)) problems.push('TRANSCRIBER must be "deepgram" or "elevenlabs"');
if (!env.OPENAI_API_KEY) problems.push('OPENAI_API_KEY is missing');
if (!env.DEEPGRAM_API_KEY && !env.ELEVENLABS_API_KEY) problems.push('set DEEPGRAM_API_KEY and/or ELEVENLABS_API_KEY');
if (!env.CHANNEL_ID) problems.push('CHANNEL_ID is missing (e.g. @your_channel)');
if (!env.ADMIN_IDS.length) problems.push('ADMIN_IDS is missing (your Telegram user id)');

if (strict && problems.length) {
  console.error(`✖ .env is not ready:\n  - ${problems.join('\n  - ')}\nSee .env.example.`);
  process.exit(1);
}
if (strict && !env.APP_URL) {
  console.warn('⚠ APP_URL is empty. After this deploy, copy the Mini App link it prints into .env (APP_URL=...) and run `npm run deploy` again.');
}

writeFileSync(
  'tgcloud/lib/env.js',
  `// GENERATED from .env by scripts/build-env.mjs — do not edit, do not commit.\n` +
    `// Tests and the local dev server may provide their own values via globalThis.__TGCLOUD_ENV__.\n` +
    `const generated = ${JSON.stringify(env, null, 2)};\n\n` +
    `export const ENV = globalThis.__TGCLOUD_ENV__ ?? generated;\n`,
);
if (strict) console.log(`✔ settings from .env written (transcription: ${env.TRANSCRIBER}${env.DEEPGRAM_API_KEY && env.ELEVENLABS_API_KEY ? ', with fallback' : ''})`);
