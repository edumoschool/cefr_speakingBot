// Recording, upload queue and small audio helpers for the exam.
import { api } from './api';
import type { Step } from './types';

export function pickMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}

export interface Recording {
  stop(): Promise<Blob>;
}

export function startRecording(stream: MediaStream): Recording {
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(1000);
  return {
    async stop() {
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      return new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
    },
  };
}

export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext!;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
    o.onended = () => ctx.close();
  } catch {}
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    speechSynthesis.speak(u);
  } catch {}
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const CHUNK_CHARS = 300_000; // the endpoint accepts up to 400k base64 chars per call
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uploads run one after another in the background while the student moves on.
 * When the last answer of a part is in, that part is graded straight away.
 */
class UploadQueue {
  private chain: Promise<void> = Promise.resolve();
  pending = 0;
  failed = 0;
  onChange?: () => void;

  private enqueue(task: () => Promise<void>) {
    this.pending++;
    this.onChange?.();
    this.chain = this.chain
      .then(task)
      .catch(() => {
        this.failed++;
      })
      .finally(() => {
        this.pending--;
        this.onChange?.();
      });
  }

  answer(sessionId: string, step: Step, blob: Blob, gradePartAfter: boolean) {
    this.enqueue(async () => {
      const b64 = await blobToBase64(blob);
      const parts: string[] = [];
      for (let i = 0; i < b64.length; i += CHUNK_CHARS) parts.push(b64.slice(i, i + CHUNK_CHARS));
      if (!parts.length) parts.push('');
      for (let i = 0; i < parts.length; i++) {
        await withRetry(() => api.uploadChunk({ session: sessionId, key: step.key, index: i, total: parts.length, mime: blob.type, data: parts[i] }));
      }
    });
    if (gradePartAfter) {
      // Best effort: if this fails, finish_mock grades the part anyway.
      this.enqueue(() => api.gradePart(sessionId, step.part).then(() => undefined, () => undefined));
    }
  }

  drain() {
    return this.chain;
  }
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      // Our own EndpointErrors are final (bad input, finished mock…) except BUSY; auth errors won't fix
      // themselves; anything else (internal error, network, timeout) is worth another try.
      const final = (e?.type === 'ENDPOINT_ERROR' && e.code !== 'BUSY') || e?.type === 'UNAUTHORIZED';
      const retryable = !final;
      if (!retryable || attempt >= tries) throw e;
      await sleep(1500 * attempt);
    }
  }
}

export const uploads = new UploadQueue();
