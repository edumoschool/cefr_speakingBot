import { one, query } from './db.js';
import { HttpError } from './http.js';
import { buildSteps, getTest, modelAnswer, pickTest, type Step, type TestDef } from './tests.js';
import { assess, type AnswerInput, type Assessment } from './assess.js';
import type { SpeechMetrics } from './speech.js';

export interface SessionRow {
  id: string;
  user_id: string;
  test_id: string;
  status: 'in_progress' | 'grading' | 'done' | 'failed';
  score: number | null;
  level: string | null;
  result: any;
  created_at: string;
  finished_at: string | null;
}

/** Unfinished mocks older than this can no longer receive answers (they can still be graded). */
export const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

export function publicTest(t: TestDef) {
  return { id: t.id, title: t.title, topics: t.topics, steps: buildSteps(t) };
}

export async function activeSession(userId: number): Promise<SessionRow | undefined> {
  return one<SessionRow>(
    `SELECT * FROM sessions WHERE user_id = $1 AND status IN ('in_progress','grading') ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
}

export async function answeredKeys(sessionId: string): Promise<string[]> {
  const rows = await query<{ step_key: string }>('SELECT step_key FROM answers WHERE session_id = $1', [sessionId]);
  return rows.map((r) => r.step_key);
}

/**
 * Spends one attempt and opens a session in a single statement: if the user
 * has no attempts, or already has an active session (partial unique index),
 * nothing is written.
 */
export async function startSession(userId: number): Promise<SessionRow> {
  const taken = await query<{ test_id: string }>('SELECT test_id FROM sessions WHERE user_id = $1', [userId]);
  const test = pickTest(taken.map((r) => r.test_id));
  let row: SessionRow | undefined;
  try {
    row = await one<SessionRow>(
      `WITH spent AS (
         UPDATE users SET attempts = attempts - 1 WHERE id = $1 AND attempts > 0 RETURNING id
       ), s AS (
         INSERT INTO sessions (user_id, test_id) SELECT id, $2 FROM spent RETURNING *
       ), l AS (
         INSERT INTO attempt_ledger (user_id, delta, reason, session_id) SELECT user_id, -1, 'mock_start', id FROM s
       )
       SELECT * FROM s`,
      [userId, test.id],
    );
  } catch (e: any) {
    if (e?.code === '23505') throw new HttpError(409, 'You already have a mock in progress.', 'active_session');
    throw e;
  }
  if (!row) throw new HttpError(402, 'You have no attempts left. Invite friends to earn more.', 'no_attempts');
  return row;
}

export async function getOwnSession(id: string, userId: number): Promise<SessionRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Bad session id', 'bad_request');
  const s = await one<SessionRow>('SELECT * FROM sessions WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!s) throw new HttpError(404, 'Mock not found', 'not_found');
  return s;
}

export function stepFor(s: SessionRow, key: string): Step {
  const test = getTest(s.test_id);
  const step = test && buildSteps(test).find((x) => x.key === key);
  if (!step) throw new HttpError(400, 'Unknown question', 'bad_step');
  return step;
}

export async function saveAnswer(sessionId: string, key: string, transcript: string, metrics: SpeechMetrics): Promise<boolean> {
  const rows = await query(
    `INSERT INTO answers (session_id, step_key, transcript, metrics) VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, step_key) DO NOTHING RETURNING step_key`,
    [sessionId, key, transcript, JSON.stringify(metrics)],
  );
  return rows.length > 0;
}

/**
 * Grades a session exactly once: the in_progress → grading transition is the
 * lock. On failure the session goes back to in_progress so the user can retry
 * without losing their attempt.
 */
export async function gradeSession(id: string, userId: number): Promise<{ session: SessionRow; fresh: boolean }> {
  const s = await one<SessionRow>(
    `UPDATE sessions SET status = 'grading' WHERE id = $1 AND user_id = $2 AND status = 'in_progress' RETURNING *`,
    [id, userId],
  );
  if (!s) {
    const cur = await getOwnSession(id, userId);
    if (cur.status === 'done') return { session: cur, fresh: false };
    throw new HttpError(409, 'This mock is already being assessed. Please wait a moment.', 'grading');
  }
  try {
    const test = getTest(s.test_id)!;
    const steps = buildSteps(test);
    const rows = await query<{ step_key: string; transcript: string; metrics: SpeechMetrics }>(
      'SELECT step_key, transcript, metrics FROM answers WHERE session_id = $1',
      [id],
    );
    if (rows.length === 0) throw new HttpError(400, 'Record at least one answer before finishing.', 'no_answers');
    const byKey = new Map(rows.map((r) => [r.step_key, r]));
    const answers: AnswerInput[] = steps
      .filter((st) => byKey.has(st.key))
      .map((st) => ({ step: st, transcript: byKey.get(st.key)!.transcript, metrics: byKey.get(st.key)!.metrics }));
    const assessment = await assess(answers);
    const result = buildResult(test, steps, byKey, assessment);
    const done = await one<SessionRow>(
      `UPDATE sessions SET status = 'done', score = $2, level = $3, result = $4, finished_at = now() WHERE id = $1 RETURNING *`,
      [id, assessment.score, assessment.level, JSON.stringify(result)],
    );
    return { session: done!, fresh: true };
  } catch (e) {
    await query(`UPDATE sessions SET status = 'in_progress' WHERE id = $1 AND status = 'grading'`, [id]);
    throw e;
  }
}

function buildResult(
  test: TestDef,
  steps: Step[],
  byKey: Map<string, { transcript: string; metrics: SpeechMetrics }>,
  a: Assessment,
) {
  const comments = new Map(a.llm.steps.map((s) => [s.key, s.comment]));
  return {
    testId: test.id,
    testTitle: test.title,
    score: a.score,
    level: a.level,
    criteria: a.criteria,
    parts: a.parts,
    overall: a.llm.overall_feedback,
    strengths: a.llm.strengths,
    priorities: a.llm.priorities,
    corrections: a.llm.corrections,
    vocabulary: a.llm.vocabulary_upgrades,
    pronunciation: a.llm.pronunciation_tips,
    model: a.model,
    answers: steps.map((st) => ({
      key: st.key,
      part: st.part,
      question: st.question,
      transcript: byKey.get(st.key)?.transcript ?? null,
      metrics: byKey.get(st.key)?.metrics ?? null,
      comment: comments.get(st.key) ?? '',
      modelAnswer: modelAnswer(test, st.key) ?? null,
    })),
  };
}
