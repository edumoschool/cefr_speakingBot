// POST /api/start_mock — spends an attempt and starts a mock, or resumes the open one.
import { EndpointError } from 'sdk';
import { getTest, publicTest } from '../lib/exam.js';
import { activeSession, answeredKeys, gradedParts, isExpired, settleExpired, startSession } from '../lib/sessions.js';
import { getUser, refreshMembership } from '../lib/users.js';

export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  const user = await getUser(userId);
  if (!user) throw new EndpointError('Please reopen the app.', { code: 'UNKNOWN_USER' });
  if (user.blocked) throw new EndpointError('Your account is blocked.', { code: 'BLOCKED' });
  if (!(await refreshMembership(userId))) throw new EndpointError('Join our channel to take a mock.', { code: 'NOT_MEMBER' });

  const session = (await settleExpired(await activeSession(userId))) ?? (await startSession(userId));
  return {
    session: { id: session.id, status: session.status },
    // Past its time window but with answers: the app goes straight to grading.
    expired: isExpired(session),
    test: publicTest(getTest(session.test_id)),
    answered: await answeredKeys(session.id),
    graded: await gradedParts(session.id),
  };
}
