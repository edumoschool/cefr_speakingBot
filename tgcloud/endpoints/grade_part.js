// POST /api/grade_part — { session, part }. Called in the background as soon as a
// part's answers are uploaded, so the final result is ready almost instantly.
import { getOwnSession, gradeSessionPart } from '../lib/sessions.js';

export default async function (input, ctx) {
  const session = await getOwnSession(input.session, ctx.initData.user.id);
  if (session.status !== 'in_progress') return { ok: true };
  await gradeSessionPart(session, String(input.part));
  return { ok: true };
}
