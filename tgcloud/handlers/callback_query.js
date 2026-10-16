// handlers/callback_query.js — the "I've joined" button under the welcome message.
import { api } from 'sdk';
import { REFERRALS_PER_ATTEMPT } from '../lib/config.js';
import { openAppKeyboard, refreshMembership, upsertUser } from '../lib/users.js';
import { startChatMock } from '../lib/chatmode.js';
import { sendInvoice } from '../lib/payments.js';

export default async function (query) {
  if (query.data?.startsWith('buy:')) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return sendInvoice(query.from.id, query.data.slice(4));
  }
  if (query.data === 'voice_mode') {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    await upsertUser(query.from);
    return startChatMock(query.from.id);
  }
  if (query.data !== 'check_join') return api.answerCallbackQuery({ callback_query_id: query.id });
  await upsertUser(query.from);
  if (!(await refreshMembership(query.from.id))) {
    return api.answerCallbackQuery({
      callback_query_id: query.id,
      text: "We couldn't see you in the channel yet. Join it and tap again.",
      show_alert: true,
    });
  }
  await api.answerCallbackQuery({ callback_query_id: query.id, text: 'Thanks for joining! 🎉' });
  if (query.message) {
    try {
      await api.deleteMessage({ chat_id: query.message.chat.id, message_id: query.message.message_id });
    } catch {}
  }
  return api.sendMessage({
    chat_id: query.from.id,
    text: `✅ You're in! Your first mock is free, and every ${REFERRALS_PER_ATTEMPT} friends who join through your link (/referral) give you another one.`,
    reply_markup: await openAppKeyboard(),
  });
}
