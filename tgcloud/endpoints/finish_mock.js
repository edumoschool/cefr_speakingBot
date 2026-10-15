// POST /api/finish_mock — { session }. Scores the mock and posts the headline result in the chat.
import { api } from 'sdk';
import { finishSession } from '../lib/sessions.js';
import { openAppKeyboard } from '../lib/users.js';
import { escapeHtml } from '../lib/util.js';

export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  const { session, fresh } = await finishSession(input.session, userId);
  const result = JSON.parse(session.result);
  if (fresh) {
    try {
      await api.sendMessage({
        chat_id: userId,
        parse_mode: 'HTML',
        text: `📊 <b>Your Multilevel speaking result</b>\n${escapeHtml(result.testTitle)}\n\nScore: <b>${result.score}/75</b> · Level: <b>${result.level}</b>\n\n${escapeHtml(result.overall)}`,
        reply_markup: await openAppKeyboard('📄 Full feedback', `#result=${session.id}`),
      });
    } catch (e) {
      console.warn('result message failed', e.description ?? String(e));
    }
  }
  return { id: session.id, result };
}
