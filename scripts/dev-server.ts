/**
 * Local dev server: serves /public and routes /api/* to the same handlers
 * Vercel runs. Optional fakes for offline development:
 *   FAKE_TELEGRAM=1  – Bot API calls succeed and everyone is a channel member
 *   FAKE_DEEPGRAM=1  – transcription returns a canned answer with word timings
 * Usage: npm run dev   (reads .env if present)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input instanceof Request ? input.url : input);
  if (process.env.FAKE_TELEGRAM && url.startsWith('https://api.telegram.org/')) {
    const method = url.split('/').pop();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    console.log(`[fake telegram] ${method}`, method === 'sendMessage' ? String(body.text).slice(0, 120) : '');
    const result = method === 'getChatMember' ? { status: 'member' } : method === 'getMe' ? { id: 1, username: 'dev_bot' } : true;
    return new Response(JSON.stringify({ ok: true, result }), { headers: { 'content-type': 'application/json' } });
  }
  if (process.env.FAKE_DEEPGRAM && url.startsWith('https://api.deepgram.com/')) {
    const text =
      "Well, um, I think this is a really interesting question. In my opinion, people should have the opportunity to " +
      "choose what suits them best, because everyone has different needs. For example, my brother prefers studying " +
      "alone, whereas I enjoy working in a group since we can share ideas. However, it depends on the situation.";
    let t = 0.4;
    const words = text.split(' ').map((w) => {
      const start = t;
      t += 0.38 + (w.endsWith(',') || w.endsWith('.') ? 0.5 : 0);
      return { word: w.replace(/[.,]/g, '').toLowerCase(), start, end: start + 0.33, confidence: 0.93, punctuated_word: w };
    });
    return new Response(JSON.stringify({ metadata: {}, results: { channels: [{ alternatives: [{ transcript: text, confidence: 0.93, words }] }] } }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

const ROOT = process.cwd();
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const file = path.join(ROOT, url.pathname + '.ts');
      if (!existsSync(file)) return void res.writeHead(404).end('not found');
      const mod = await import(pathToFileURL(file).href);
      const fn = mod[req.method ?? 'GET'];
      if (!fn) return void res.writeHead(405).end('method not allowed');
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : Buffer.concat(chunks),
      });
      const response: Response = await fn(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return void res.end(Buffer.from(await response.arrayBuffer()));
    }
    let file = path.join(ROOT, 'public', path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('error');
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Dev server on http://localhost:${port}`));
