// When grading or transcription breaks (wrong key, no credit, provider down),
// students only see "something went wrong". This tells the owner the real reason:
// a message to the admins (at most one every 10 minutes) and a line in /admin.
import { api, EndpointError } from 'sdk';
import { adminIds } from './owners.js';
import { getSetting, KEYS, setSetting } from './settings.js';

const ALERT_EVERY_SEC = 600;

/** Never echo a key back, even partly (providers quote it in some errors). */
const redact = (s) => String(s).replace(/\b(sk|sk-proj|xi|dg)[-_][A-Za-z0-9_-]{6,}/g, '[key]').replace(/[A-Fa-f0-9]{32,}/g, '[key]');

/** A plain-words hint for the usual provider errors. */
export function explain(message) {
  const m = message.toLowerCase();
  const who = m.startsWith('openai') ? 'OpenAI' : m.startsWith('deepgram') ? 'Deepgram' : m.startsWith('elevenlabs') ? 'ElevenLabs' : null;
  if (/ 401\b|invalid.*key|incorrect api key|unauthori/.test(m)) return `The ${who ?? 'API'} key in .env is wrong or was revoked. Fix it in .env, then run npm run deploy.`;
  if (/insufficient_quota|quota|billing|credit|payment required| 402\b/.test(m)) return `The ${who ?? 'provider'} account has no credit left. Top it up on their website.`;
  if (/model.*(not exist|not found|does not have access)|model_not_found/.test(m)) return 'This OpenAI account cannot use the model in OPENAI_MODEL. Try OPENAI_MODEL=gpt-5-mini in .env and deploy again.';
  if (/ 429\b|rate limit/.test(m)) return `${who ?? 'The provider'} is rate-limiting requests. It usually passes in a minute; if it keeps happening, raise the account limits.`;
  if (/ 5\d\d\b|timeout|timed out|network|fetch failed/.test(m)) return `${who ?? 'A provider'} did not answer in time. Students can press the button again.`;
  if (/not set in \.env|no speech-to-text key/.test(m)) return 'A key is missing in .env. Add it and run npm run deploy.';
  return null;
}

/** Records an unexpected failure; refusals we raise on purpose (EndpointError) are ignored. */
export async function reportProblem(where, error) {
  if (error instanceof EndpointError) return;
  const message = redact(error?.message ?? error).slice(0, 400);
  console.error(where, message);
  try {
    const now = Math.floor(Date.now() / 1000);
    await setSetting(KEYS.lastError, JSON.stringify({ at: now, where, message }));
    const last = Number(await getSetting(KEYS.lastAlertAt)) || 0;
    if (now - last < ALERT_EVERY_SEC) return;
    await setSetting(KEYS.lastAlertAt, String(now));
    const hint = explain(message);
    const text = `⚠️ ${where} failed for a student.\n\n${hint ? `👉 ${hint}\n\n` : ''}Details: ${message}`;
    for (const chat_id of await adminIds()) {
      try {
        await api.sendMessage({ chat_id, text });
      } catch {}
    }
  } catch (e) {
    console.warn('could not record problem', String(e));
  }
}

/** For the admin panel: the latest problem, if any. */
export async function lastProblem() {
  try {
    return JSON.parse((await getSetting(KEYS.lastError)) ?? 'null');
  } catch {
    return null;
  }
}
