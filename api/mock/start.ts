import { handler, HttpError, json, requireAuth } from '../../lib/http.js';
import { activeSession, answeredKeys, publicTest, startSession } from '../../lib/sessions.js';
import { getTest } from '../../lib/tests.js';
import { getUser, refreshMembership } from '../../lib/users.js';

/** Starts a new mock (spending an attempt) or resumes the unfinished one. */
export const POST = handler(async (req) => {
  const { user: tgUser } = requireAuth(req);
  const user = await getUser(tgUser.id);
  if (!user) throw new HttpError(401, 'Please reopen the app.', 'unauthorized');
  if (user.blocked) throw new HttpError(403, 'Your account is blocked.', 'blocked');
  if (!(await refreshMembership(tgUser.id))) throw new HttpError(403, 'Join our channel to take a mock.', 'not_member');

  const session = (await activeSession(tgUser.id)) ?? (await startSession(tgUser.id));
  const test = getTest(session.test_id)!;
  return json({ session: { id: session.id, status: session.status }, test: publicTest(test), answered: await answeredKeys(session.id) });
});
