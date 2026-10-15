import { DeepgramClient } from '@deepgram/sdk';
import { env } from './env.js';

export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SpeechMetrics {
  wordCount: number;
  /** Seconds from first to last word. */
  speakingTime: number;
  /** Words per minute over the speaking time. */
  wpm: number;
  /** Silences of 1s+ between words, and of 2.5s+. */
  pauses: number;
  longPauses: number;
  fillers: number;
  /** Mean ASR word confidence — a rough proxy for intelligibility. */
  avgConfidence: number;
  /** Words the recogniser was unsure about (likely mispronounced). */
  unclearWords: string[];
  /** Share of the allowed time actually used, 0..1. */
  timeUsed: number;
}

const FILLERS = new Set(['uh', 'um', 'uhm', 'umm', 'er', 'erm', 'ah', 'eh', 'hmm', 'mm', 'mhm']);

export function computeMetrics(words: Word[], allowedSec: number): SpeechMetrics {
  const fillers = words.filter((w) => FILLERS.has(w.word.toLowerCase())).length;
  const content = words.filter((w) => !FILLERS.has(w.word.toLowerCase()));
  let pauses = 0;
  let longPauses = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= 1) pauses++;
    if (gap >= 2.5) longPauses++;
  }
  const speakingTime = words.length ? Math.max(0, words[words.length - 1].end - words[0].start) : 0;
  const avgConfidence = content.length ? content.reduce((s, w) => s + w.confidence, 0) / content.length : 0;
  const unclear = [...new Set(content.filter((w) => w.confidence < 0.6 && w.word.length > 2).map((w) => w.word.toLowerCase()))];
  return {
    wordCount: content.length,
    speakingTime: round(speakingTime, 1),
    wpm: speakingTime > 3 ? Math.round((content.length / speakingTime) * 60) : 0,
    pauses,
    longPauses,
    fillers,
    avgConfidence: round(avgConfidence, 3),
    unclearWords: unclear.slice(0, 15),
    timeUsed: allowedSec ? round(Math.min(1, speakingTime / allowedSec), 2) : 0,
  };
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

let dg: DeepgramClient | undefined;

export async function transcribe(audio: Uint8Array, allowedSec: number): Promise<{ transcript: string; metrics: SpeechMetrics }> {
  dg ??= new DeepgramClient({ apiKey: env.deepgramKey });
  const res: any = await dg.listen.v1.media.transcribeFile(audio, {
    model: env.deepgramModel as any,
    language: 'en',
    smart_format: true,
    punctuate: true,
    // Keep "um/uh" in the transcript: hesitation is part of fluency scoring.
    filler_words: true,
  });
  const alt = res?.results?.channels?.[0]?.alternatives?.[0] ?? {};
  const words: Word[] = (alt.words ?? []).map((w: any) => ({
    word: String(w.word ?? ''),
    start: Number(w.start ?? 0),
    end: Number(w.end ?? 0),
    confidence: Number(w.confidence ?? 0),
  }));
  return { transcript: String(alt.transcript ?? '').trim(), metrics: computeMetrics(words, allowedSec) };
}
