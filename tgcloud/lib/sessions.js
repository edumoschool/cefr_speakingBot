import { db, EndpointError } from 'sdk';
import { sql } from 'sdk/db';
import { SESSION_TTL_SEC } from './config.js';
import { buildSteps, getTest, modelAnswer, PARTS, pickTest } from './exam.js';
import { gradePart as llmGradePart, summarize } from './grading.js';
import { CRITERIA, scorePart, totalScore } from './scoring.js';
import { transcribe } from './speech.js';
import { base64ToBytes, concatBytes, newId, nowSec } from './util.js';
import { returning } from './db.js';

const fail = (code, message) => new EndpointError(message, { code });

export const MAX_CHUNKS = 40;
export const MAX_CHUNK_CHARS = 400_000; // base64 characters per request (~300 KB of audio)
const MIN_AUDIO_BYTES = 1500; // smaller = just a container header, no speech
const PART_LOCK_SEC = 150; // a "running" part grade older than this is considered dead

export async function activeSession(userId) {
  return db.get(sql`SELECT * FROM sessions WHERE user_id = ${userId} AND status IN ('in_progress', 'grading')
                    ORDER BY created_at DESC LIMIT 1`);
}

export const isExpired = (s) => s.status === 'in_progress' && nowSec() - s.created_at > SESSION_TTL_SEC;

/**
 * Keeps an unfinished mock past its time window from blocking new ones. With
 * no answers it is closed as 'expired' and the attempt refunded; with answers it
 * stays open and callers send the user straight to grading.
 * @returns the session if it is still active, otherwise null
 */
export async function settleExpired(session) {
  if (!session || !isExpired(session)) return session ?? null;
  if ((await answeredKeys(session.id)).length) return session;
  const closed = await returning(sql`UPDATE sessions SET status = 'expired', finished_at = unixepoch()
                                     WHERE id = ${session.id} AND status = 'in_progress' RETURNING id`);
  if (closed.length) {
    await db.run(sql`UPDATE users SET attempts = attempts + 1 WHERE id = ${session.user_id}`);
    await db.run(sql`INSERT INTO attempt_ledger (user_id, delta, reason, session_id) VALUES (${session.user_id}, 1, 'refund', ${session.id})`);
  }
  await db.run(sql`DELETE FROM audio_chunks WHERE session_id = ${session.id}`);
  return null;
}

async function feedbackLang(userId) {
  const u = await db.get(sql`SELECT feedback_lang FROM users WHERE id = ${userId}`);
  return u?.feedback_lang ?? 'en';
}

export async function answeredKeys(sessionId) {
  const rows = await db.all(sql`SELECT step_key FROM answers WHERE session_id = ${sessionId}`);
  return rows.map((r) => r.step_key);
}

export async function gradedParts(sessionId) {
  const rows = await db.all(sql`SELECT part FROM part_grades WHERE session_id = ${sessionId} AND status = 'done'`);
  return rows.map((r) => r.part);
}

export async function getOwnSession(id, userId) {
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) throw fail('BAD_REQUEST', 'Bad session id');
  const s = await db.get(sql`SELECT * FROM sessions WHERE id = ${id} AND user_id = ${userId}`);
  if (!s) throw fail('NOT_FOUND', 'Mock not found');
  return s;
}

/**
 * Spends one attempt and opens a session. The attempt is only taken if the user
 * has one and no open mock (single UPDATE); the partial unique index guards the
 * insert, and a lost race refunds the attempt.
 */
export async function startSession(userId) {
  // Housekeeping: drop partial uploads nobody will finish.
  await db.run(sql`DELETE FROM audio_chunks WHERE created_at < ${nowSec() - SESSION_TTL_SEC}`);
  const taken = await db.all(sql`SELECT test_id FROM sessions WHERE user_id = ${userId}`);
  const test = pickTest(taken.map((r) => r.test_id));
  const spent = await returning(sql`
    UPDATE users SET attempts = attempts - 1
    WHERE id = ${userId} AND attempts > 0
      AND NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = ${userId} AND status IN ('in_progress', 'grading'))
    RETURNING attempts`);
  if (!spent.length) {
    if (await activeSession(userId)) throw fail('ACTIVE_SESSION', 'You already have a mock in progress.');
    throw fail('NO_ATTEMPTS', 'You have no attempts left. Invite friends to earn more.');
  }
  const id = newId();
  try {
    await db.run(sql`INSERT INTO sessions (id, user_id, test_id) VALUES (${id}, ${userId}, ${test.id})`);
  } catch (e) {
    await db.run(sql`UPDATE users SET attempts = attempts + 1 WHERE id = ${userId}`);
    throw fail('ACTIVE_SESSION', 'You already have a mock in progress.');
  }
  await db.run(sql`INSERT INTO attempt_ledger (user_id, delta, reason, session_id) VALUES (${userId}, -1, 'mock_start', ${id})`);
  return db.get(sql`SELECT * FROM sessions WHERE id = ${id}`);
}

export function stepFor(session, key) {
  const test = getTest(session.test_id);
  const step = test && buildSteps(test).find((s) => s.key === key);
  if (!step) throw fail('BAD_STEP', 'Unknown question');
  return step;
}

/**
 * Stores one base64 chunk of a recording. When the last chunk is in, the audio
 * is assembled, transcribed and saved; chunks are deleted only after success,
 * so re-sending the last chunk retries a failed transcription.
 */
export async function receiveChunk(session, { key, index, total, mime, data }) {
  checkOpen(session);
  const step = stepFor(session, key);
  if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS || !Number.isInteger(index) || index < 0 || index >= total) {
    throw fail('BAD_REQUEST', 'Bad chunk index');
  }
  if (typeof data !== 'string' || data.length > MAX_CHUNK_CHARS) throw fail('TOO_LARGE', 'Recording chunk is too large.');
  if ((await answeredKeys(session.id)).includes(key)) return { done: true, duplicate: true };

  let bytes;
  try {
    bytes = base64ToBytes(data);
  } catch {
    throw fail('BAD_REQUEST', 'Invalid audio data');
  }
  await db.run(sql`INSERT INTO audio_chunks (session_id, step_key, idx, total, data)
                   VALUES (${session.id}, ${key}, ${index}, ${total}, ${bytes}) ON CONFLICT DO NOTHING`);
  const have = await db.get(sql`SELECT count(*) AS n FROM audio_chunks
                                WHERE session_id = ${session.id} AND step_key = ${key} AND total = ${total}`);
  if (have.n < total) return { done: false, received: have.n };

  const rows = await db.all(sql`SELECT data FROM audio_chunks
                                WHERE session_id = ${session.id} AND step_key = ${key} AND total = ${total} ORDER BY idx`);
  const audio = concatBytes(rows.map((r) => toBytes(r.data)));
  const { words } = await saveAudioAnswer(session, step, audio, mime);
  await db.run(sql`DELETE FROM audio_chunks WHERE session_id = ${session.id} AND step_key = ${key}`);
  return { done: true, words };
}

export function checkOpen(session) {
  if (session.status !== 'in_progress') throw fail('FINISHED', 'This mock is already finished.');
  if (nowSec() - session.created_at > SESSION_TTL_SEC) {
    throw fail('EXPIRED', 'This mock has expired. Finish it to get results for the answers you recorded.');
  }
}

/**
 * Transcribes one complete recording and stores it as the answer to `step`.
 * Shared by the Mini App (chunked base64 upload) and chat voice messages.
 * @returns {{ inserted: boolean, words: number }} inserted=false if the step already had an answer
 */
export async function saveAudioAnswer(session, step, audio, mime) {
  const safeMime = /^audio\/[\w.+-]+(;\s*codecs=[\w.]+)?$/.test(mime ?? '') ? mime : 'audio/webm';
  const { transcript, metrics } =
    audio.length < MIN_AUDIO_BYTES ? { transcript: '', metrics: emptyMetrics(step.speakSec) } : await transcribe(audio, safeMime, step.speakSec);
  const rows = await returning(sql`INSERT INTO answers (session_id, step_key, transcript, metrics)
                   VALUES (${session.id}, ${step.key}, ${transcript}, ${JSON.stringify(metrics)}) ON CONFLICT DO NOTHING RETURNING step_key`);
  return { inserted: rows.length > 0, words: metrics.wordCount };
}

/** The first question without an answer, or null when all are answered. */
export async function nextStep(session) {
  const done = new Set(await answeredKeys(session.id));
  return buildSteps(getTest(session.test_id)).find((s) => !done.has(s.key)) ?? null;
}

function toBytes(v) {
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

function emptyMetrics(allowedSec) {
  return { wordCount: 0, speakingTime: 0, wpm: 0, pauses: 0, longPauses: 0, fillers: 0, avgConfidence: 0, unclearWords: [], timeUsed: 0, allowedSec };
}

async function partAnswers(session, part) {
  const steps = buildSteps(getTest(session.test_id)).filter((s) => s.part === part);
  const rows = await db.all(sql`SELECT step_key, transcript, metrics FROM answers WHERE session_id = ${session.id}`);
  const byKey = new Map(rows.map((r) => [r.step_key, r]));
  return steps
    .filter((s) => byKey.has(s.key))
    .map((s) => ({ step: s, transcript: byKey.get(s.key).transcript, metrics: JSON.parse(byKey.get(s.key).metrics) }));
}

/**
 * Grades one part exactly once. A "running" row is the lock; a stale one (the
 * request died) can be taken over. Returns the stored result.
 */
export async function gradeSessionPart(session, part) {
  if (!PARTS.includes(part)) throw fail('BAD_REQUEST', 'Unknown part');
  const now = nowSec();
  let locked = (await returning(sql`INSERT INTO part_grades (session_id, part, status, updated_at)
                                 VALUES (${session.id}, ${part}, 'running', ${now}) ON CONFLICT DO NOTHING RETURNING part`)).length > 0;
  if (!locked) {
    const cur = await db.get(sql`SELECT status, result FROM part_grades WHERE session_id = ${session.id} AND part = ${part}`);
    if (cur.status === 'done') return JSON.parse(cur.result);
    locked = (await returning(sql`UPDATE part_grades SET updated_at = ${now}
                               WHERE session_id = ${session.id} AND part = ${part} AND status = 'running' AND updated_at < ${now - PART_LOCK_SEC}
                               RETURNING part`)).length > 0;
    if (!locked) throw fail('BUSY', 'This part is being assessed. Try again in a few seconds.');
  }
  try {
    const answers = await partAnswers(session, part);
    const result = answers.length ? await llmGradePart(part, answers, await feedbackLang(session.user_id)) : null;
    await db.run(sql`UPDATE part_grades SET status = 'done', result = ${JSON.stringify(result)}, updated_at = unixepoch()
                     WHERE session_id = ${session.id} AND part = ${part}`);
    return result;
  } catch (e) {
    await db.run(sql`DELETE FROM part_grades WHERE session_id = ${session.id} AND part = ${part} AND status = 'running'`);
    throw e;
  }
}

/**
 * Finishes a mock: grades any part not graded yet, scores, summarises. The
 * in_progress → grading transition is the lock; on failure the session goes
 * back to in_progress so the user can retry without losing their attempt.
 * @returns {Promise<{session: object, fresh: boolean}>}
 */
export async function finishSession(id, userId) {
  const locked = await returning(sql`UPDATE sessions SET status = 'grading'
                                  WHERE id = ${id} AND user_id = ${userId} AND status = 'in_progress' RETURNING id`);
  if (!locked.length) {
    const cur = await getOwnSession(id, userId);
    if (cur.status === 'done') return { session: cur, fresh: false };
    throw fail('BUSY', 'This mock is already being assessed. Please wait a moment.');
  }
  try {
    const session = await getOwnSession(id, userId);
    const test = getTest(session.test_id);
    if (!(await answeredKeys(id)).length) throw fail('NO_ANSWERS', 'Record at least one answer before finishing.');

    const parts = [];
    const steps = [];
    for (const part of PARTS) {
      const llm = await gradeSessionPart(session, part);
      const answers = await partAnswers(session, part);
      const words = answers.reduce((s, a) => s + a.metrics.wordCount, 0);
      const allowed = answers.reduce((s, a) => s + a.step.speakSec, 0);
      const { criteria, points } = scorePart(llm, words, allowed);
      parts.push({ part, criteria, points, words, feedback: llm?.feedback ?? (answers.length ? '' : 'Not answered.'), llm });
      steps.push(...answers);
    }
    const total = totalScore(parts);
    const summary = await summarize(parts, total.score, total.level, await feedbackLang(userId));
    const result = buildResult(test, parts, steps, total, summary);
    await db.run(sql`UPDATE sessions SET status = 'done', score = ${total.score}, level = ${total.level},
                     result = ${JSON.stringify(result)}, finished_at = unixepoch() WHERE id = ${id}`);
    await db.run(sql`DELETE FROM audio_chunks WHERE session_id = ${id}`);
    return { session: await getOwnSession(id, userId), fresh: true };
  } catch (e) {
    await db.run(sql`UPDATE sessions SET status = 'in_progress' WHERE id = ${id} AND status = 'grading'`);
    throw e;
  }
}

function buildResult(test, parts, answered, total, summary) {
  const all = (k) => parts.flatMap((p) => p.llm?.[k] ?? []);
  const comments = new Map(all('steps').map((s) => [s.key, s.comment]));
  const byKey = new Map(answered.map((a) => [a.step.key, a]));
  return {
    testId: test.id,
    testTitle: test.title,
    score: total.score,
    level: total.level,
    criteria: total.criteria,
    parts: parts.map(({ part, criteria, points, words, feedback }) => ({ part, criteria, points, words, feedback })),
    overall: summary.overall_feedback,
    strengths: summary.strengths,
    priorities: summary.priorities,
    corrections: all('corrections').slice(0, 10),
    vocabulary: all('vocabulary_upgrades').slice(0, 10),
    pronunciation: [...new Set(all('pronunciation_tips'))].slice(0, 5),
    criteriaNames: CRITERIA,
    answers: buildSteps(test).map((st) => ({
      key: st.key,
      part: st.part,
      question: st.question,
      transcript: byKey.get(st.key)?.transcript ?? null,
      metrics: byKey.get(st.key)?.metrics ?? null,
      comment: comments.get(st.key) ?? '',
      modelAnswer: modelAnswer(test, st.key),
    })),
  };
}
