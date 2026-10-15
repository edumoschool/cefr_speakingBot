import { env } from '../../lib/env.js';
import { handler, HttpError, json, readJson, requireAuth } from '../../lib/http.js';
import { gradeSession } from '../../lib/sessions.js';
import { tgSafe } from '../../lib/telegram.js';

/** Grades the mock with OpenAI and sends the headline result to the user's chat. */
export const POST = handler(async (req) => {
  const { user } = requireAuth(req);
  const { session: id } = await readJson<{ session?: string }>(req);
  if (!id) throw new HttpError(400, 'session is required', 'bad_request');
  const { session: s, fresh } = await gradeSession(id, user.id);
  if (fresh) {
    // Also post the headline in chat, so the result isn't lost if the app gets closed.
    await tgSafe('sendMessage', {
      chat_id: user.id,
      parse_mode: 'HTML',
      text: `📊 <b>Your Multilevel speaking result</b>\n${s.result.testTitle}\n\nScore: <b>${s.score}/75</b> · Level: <b>${s.level}</b>\n\n${escapeHtml(s.result.overall ?? '')}`,
      reply_markup: { inline_keyboard: [[{ text: '📄 Full feedback', web_app: { url: `${env.appUrl}/#result=${s.id}` } }]] },
    });
  }
  return json({ id: s.id, result: s.result });
});

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
