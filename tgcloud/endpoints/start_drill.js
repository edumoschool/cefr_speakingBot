// POST /api/start_drill — { part }. A free single-part practice (daily allowance), or resumes the open session.
import { EndpointError } from 'sdk';
import { getTest, publicTest } from '../lib/exam.js';
import { activeSession, answeredKeys, gradedParts, isExpired, settleExpired, startDrill } from '../lib/sessions.js';
import { getUser, refreshMembership } from '../lib/users.js';

export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  const user = await getUser(userId);
  if (!user) throw new EndpointError('Please reopen the app.', { code: 'UNKNOWN_USER' });
  if (user.blocked) throw new EndpointError('Your account is blocked.', { code: 'BLOCKED' });
  if (!(await refreshMembership(userId))) throw new EndpointError('Join our channel to practise.', { code: 'NOT_MEMBER' });

  const session = (await settleExpired(await activeSession(userId))) ?? (await startDrill(userId, String(input.part ?? '')));
  return {
    session: { id: session.id, status: session.status, kind: session.kind },
    expired: isExpired(session),
    test: publicTest(getTest(session.test_id), session.kind === 'drill' ? session.drill_part : undefined),
    answered: await answeredKeys(session.id),
    graded: await gradedParts(session.id),
  };
}
