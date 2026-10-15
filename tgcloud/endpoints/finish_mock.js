// POST /api/finish_mock — { session }. Scores the mock and posts the headline result in the chat.
import { sendResultMessage } from '../lib/chatmode.js';
import { finishSession } from '../lib/sessions.js';

export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  const { session, fresh } = await finishSession(input.session, userId);
  if (fresh) await sendResultMessage(userId, session);
  return { id: session.id, result: JSON.parse(session.result) };
}
