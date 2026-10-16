// POST /api/library — { id? }. "Questions & sample answers": study the tests
// part by part without taking them. Free for channel members; nothing is recorded.
//   {}          → { tests: [{ id, title, topics, samples }] }
//   { id }      → { test: { id, title, topics, samples, steps: [{ …step, sample }] } }
import { EndpointError } from 'sdk';
import { getTest, libraryList, libraryTest } from '../lib/exam.js';
import { getUser, refreshMembership } from '../lib/users.js';

export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  const user = await getUser(userId);
  if (!user) throw new EndpointError('Please reopen the app.', { code: 'UNKNOWN_USER' });
  if (!(await refreshMembership(userId))) throw new EndpointError('Join our channel to practise.', { code: 'NOT_MEMBER' });
  if (input?.id == null) return { tests: libraryList() };
  const test = getTest(String(input.id));
  if (!test) throw new EndpointError('This test is not available.', { code: 'BAD_REQUEST' });
  return { test: libraryTest(test) };
}
