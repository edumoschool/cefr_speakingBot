import { fetch } from 'sdk';
import { DEEPGRAM_MODEL } from './config.js';
import { computeMetrics } from './metrics.js';
import { KEYS, requireSetting } from './settings.js';

/**
 * Transcribes one recorded answer with Deepgram (pre-recorded REST API — npm
 * SDKs can't run on the platform, so this is the same call the SDK makes).
 * Filler words are kept on purpose: hesitation is part of fluency scoring.
 */
export async function transcribe(bytes, mime, allowedSec) {
  const key = await requireSetting(KEYS.deepgram, 'Deepgram API key');
  const qs = `model=${encodeURIComponent(DEEPGRAM_MODEL)}&language=en&smart_format=true&punctuate=true&filler_words=true`;
  const res = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'Content-Type': mime || 'audio/webm' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0] ?? {};
  const words = (alt.words ?? []).map((w) => ({
    word: String(w.word ?? ''),
    start: Number(w.start ?? 0),
    end: Number(w.end ?? 0),
    confidence: Number(w.confidence ?? 0),
  }));
  return { transcript: String(alt.transcript ?? '').trim(), metrics: computeMetrics(words, allowedSec) };
}
