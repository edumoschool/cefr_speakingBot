import { handler, HttpError, json, requireAuth } from '../../lib/http.js';
import { answeredKeys, getOwnSession, saveAnswer, SESSION_TTL_MS, stepFor } from '../../lib/sessions.js';
import { computeMetrics, transcribe } from '../../lib/speech.js';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is 4.5 MB
const MIN_BYTES = 1500; // smaller than this is just a container header: no speech

/** Receives one recorded answer (raw audio body), transcribes it with Deepgram and stores it. */
export const POST = handler(async (req) => {
  const { user } = requireAuth(req);
  const url = new URL(req.url);
  const session = await getOwnSession(url.searchParams.get('session') ?? '', user.id);
  if (session.status !== 'in_progress') throw new HttpError(409, 'This mock is already finished.', 'finished');
  if (Date.now() - new Date(session.created_at).getTime() > SESSION_TTL_MS) {
    throw new HttpError(410, 'This mock has expired. Finish it to get results for the answers you recorded.', 'expired');
  }
  const key = url.searchParams.get('key') ?? '';
  const step = stepFor(session, key);
  // Never pay for transcribing the same answer twice (e.g. a client retry).
  if ((await answeredKeys(session.id)).includes(key)) return json({ ok: true, duplicate: true });

  const audio = new Uint8Array(await req.arrayBuffer());
  if (audio.byteLength > MAX_BYTES) throw new HttpError(413, 'Recording is too large.', 'too_large');

  const { transcript, metrics } =
    audio.byteLength < MIN_BYTES ? { transcript: '', metrics: computeMetrics([], step.speakSec) } : await transcribe(audio, step.speakSec);
  await saveAnswer(session.id, key, transcript, metrics);
  return json({ ok: true, words: metrics.wordCount });
});
