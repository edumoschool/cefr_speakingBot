// Local dev server (not deployed). Runs the tgcloud endpoints through the local
// sdk stand-in and serves the built Mini App from dist/.
//
//   npm run build && npm run dev:api        → http://localhost:8787/?user=1001
//   (or `npm run dev` for Vite with hot reload, proxying /api here)
//
// Env: the same names as .env.example (OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, TRANSCRIBER, …).
//      FAKE_DEEPGRAM=1 returns a canned transcript (no Deepgram key needed).
//      LOCAL_DB=dev/.local.db keeps data between restarts (default: in memory).
//      PAYMENTS=on shows the Stars shop (invoices are faked locally).
// The user is taken from the x-dev-init header (no Telegram signature locally).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// Settings for local runs come from your shell / .env, the same names as .env.example.
const env = (k, d = '') => process.env[k] ?? d;
globalThis.__TGCLOUD_ENV__ = {
  OPENAI_API_KEY: env('OPENAI_API_KEY'), OPENAI_MODEL: env('OPENAI_MODEL', 'gpt-5.4-mini'),
  TRANSCRIBER: env('TRANSCRIBER', 'deepgram'),
  DEEPGRAM_API_KEY: env('DEEPGRAM_API_KEY', process.env.FAKE_DEEPGRAM ? 'fake' : ''), DEEPGRAM_MODEL: env('DEEPGRAM_MODEL', 'nova-3'),
  ELEVENLABS_API_KEY: env('ELEVENLABS_API_KEY'), ELEVENLABS_MODEL: env('ELEVENLABS_MODEL', 'scribe_v2'),
  CHANNEL_ID: env('CHANNEL_ID', '@dev_channel'), CHANNEL_URL: env('CHANNEL_URL', 'https://t.me/dev_channel'),
  ADMIN_IDS: env('ADMIN_IDS', '1001').split(',').map(Number), SUPPORT_CONTACT: env('SUPPORT_CONTACT', '@support'),
  APP_URL: env('APP_URL', 'http://localhost:8787/'),
};
const { EndpointError, fake } = await import('sdk');
const { default: db, _database, createSchema } = await import('sdk/db');

const ROOT = process.cwd();
createSchema(_database(), await import(pathToFileURL(path.join(ROOT, 'tgcloud/schema.js')).href));
if (process.env.PAYMENTS === 'on') await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('payments', 'on')");
fake.allMembers = true;

if (process.env.FAKE_DEEPGRAM) {
  const real = fake.fetch;
  fake.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.deepgram.com/')) return real(url, init);
    const text = process.env.FAKE_TRANSCRIPT ??
      "Well, um, I think this is a really interesting question. In my opinion it depends on the person, because everyone has " +
      "different needs. For example, my brother prefers studying alone, whereas I enjoy working in a group since we can share ideas.";
    let t = 0.4;
    const words = text.split(' ').map((w) => {
      const start = t;
      t += 0.38 + (/[.,]$/.test(w) ? 0.5 : 0);
      return { word: w.replace(/[.,]/g, '').toLowerCase(), start, end: start + 0.33, confidence: 0.93 };
    });
    return Response.json({ results: { channels: [{ alternatives: [{ transcript: text, words }] }] } });
  };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const send = (status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const m = /^\/api\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(url.pathname);
  if (m && req.method === 'POST') {
    const file = path.join(ROOT, 'tgcloud/endpoints', `${m[1]}.js`);
    if (!existsSync(file)) return send(404, { ok: false, description: 'Not found' });
    let initData;
    try {
      initData = JSON.parse(req.headers['x-dev-init'] ?? 'null');
    } catch {}
    if (!initData?.user?.id) return send(401, { ok: false, error_type: 'UNAUTHORIZED', description: 'Missing init data' });
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const fn = (await import(pathToFileURL(file).href)).default;
      return send(200, { ok: true, result: await fn(input, { initData }) });
    } catch (e) {
      if (e instanceof EndpointError) return send(400, { ok: false, error_type: 'ENDPOINT_ERROR', description: e.description, parameters: e.parameters });
      console.error(e);
      return send(500, { ok: false, error_type: 'INTERNAL', description: 'Internal error' });
    }
  }
  let file = path.join(ROOT, 'dist', path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) return send(404, 'not found', 'text/plain');
  send(200, readFileSync(file), TYPES[path.extname(file)] ?? 'application/octet-stream');
}).listen(Number(process.env.PORT ?? 8787), () => console.log(`Dev server: http://localhost:${process.env.PORT ?? 8787}/?user=1001`));
