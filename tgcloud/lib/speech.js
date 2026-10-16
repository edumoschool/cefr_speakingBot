import { fetch, FormData, InputFile } from 'sdk';
import { ENV } from './env.js';
import { computeMetrics } from './metrics.js';

/**
 * Speech-to-text with two providers. ENV.TRANSCRIBER picks the main one; if it
 * fails (or has no key) the other is used, when its key is set. npm SDKs can't
 * run on the platform, so these are the providers' REST APIs (the same requests
 * their SDKs make). Both are normalised to { word, start, end, confidence }
 * so the fluency metrics and grading don't depend on the provider.
 */
export async function transcribe(bytes, mime, allowedSec) {
  const order = ENV.TRANSCRIBER === 'elevenlabs' ? ['elevenlabs', 'deepgram'] : ['deepgram', 'elevenlabs'];
  const available = order.filter((p) => (p === 'deepgram' ? ENV.DEEPGRAM_API_KEY : ENV.ELEVENLABS_API_KEY));
  if (!available.length) throw new Error('No speech-to-text key: set DEEPGRAM_API_KEY or ELEVENLABS_API_KEY in .env');
  let lastError;
  for (const provider of available) {
    try {
      const { transcript, words } = provider === 'deepgram' ? await deepgram(bytes, mime) : await elevenlabs(bytes, mime);
      return { transcript, metrics: { ...computeMetrics(words, allowedSec), provider } };
    } catch (e) {
      lastError = e;
      console.warn(`${provider} transcription failed`, String(e));
    }
  }
  throw lastError;
}

// Deepgram pre-recorded API. Filler words are kept: hesitation is part of fluency scoring.
async function deepgram(bytes, mime) {
  const qs = `model=${encodeURIComponent(ENV.DEEPGRAM_MODEL)}&language=en&smart_format=true&punctuate=true&filler_words=true`;
  const res = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
    method: 'POST',
    headers: { Authorization: `Token ${ENV.DEEPGRAM_API_KEY}`, 'Content-Type': mime || 'audio/webm' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0] ?? {};
  return {
    transcript: String(alt.transcript ?? '').trim(),
    words: (alt.words ?? []).map((w) => ({
      word: String(w.word ?? ''),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
      confidence: Number(w.confidence ?? 0),
    })),
  };
}

// ElevenLabs Scribe (POST /v1/speech-to-text, multipart). Verbatim by default, so
// "um/uh" stay in. Word confidence comes as a log-probability → exp() to 0..1.
async function elevenlabs(bytes, mime) {
  const form = new FormData();
  form.append('model_id', ENV.ELEVENLABS_MODEL);
  form.append('language_code', 'en');
  form.append('timestamps_granularity', 'word');
  form.append('tag_audio_events', 'false');
  form.append('file', new InputFile(bytes, `answer.${extension(mime)}`, { type: mime || 'audio/webm' }));
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ENV.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return {
    transcript: String(data?.text ?? '').trim(),
    words: (data?.words ?? [])
      .filter((w) => w.type === 'word')
      .map((w) => ({
        word: String(w.text ?? '').replace(/[^\p{L}\p{N}'-]/gu, ''),
        start: Number(w.start ?? 0),
        end: Number(w.end ?? 0),
        confidence: Number.isFinite(w.logprob) ? Math.exp(w.logprob) : 1,
      }))
      .filter((w) => w.word),
  };
}

function extension(mime = '') {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}
