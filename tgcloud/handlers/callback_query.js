// handlers/callback_query.js — button taps under bot messages.
import { api } from 'sdk';
import { isAdmin, onAdminButton } from '../lib/admin.js';
import { sendInvite, sendLangPicker, sendMenu, sendTop } from '../lib/botui.js';
import { startChatMock } from '../lib/chatmode.js';
import { LANGS } from '../lib/grading.js';
import { sendInvoice } from '../lib/payments.js';
import { removeMessages } from '../lib/screen.js';
import { tFor } from '../lib/texts.js';
import { refreshMembership, setFeedbackLang, upsertUser } from '../lib/users.js';

export default async function (query) {
  const data = query.data ?? '';
  const userId = query.from.id;
  const done = (text, show_alert = false) => api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert });

  if (data.startsWith('adm:')) {
    if (!(await isAdmin(userId))) return done();
    return onAdminButton(query);
  }

  await upsertUser(query.from);

  if (data.startsWith('lang:')) {
    const lang = data.slice(5);
    if (!Object.hasOwn(LANGS, lang)) return done();
    await setFeedbackLang(userId, lang);
    const t = await tFor(userId);
    await done(t('langSaved'));
    return sendMenu(userId);
  }
  if (data.startsWith('buy:')) {
    await done();
    return sendInvoice(userId, data.slice(4));
  }
  if (data === 'voice_mode') {
    await done();
    return startChatMock(userId);
  }
  if (data === 'menu:invite') {
    await done();
    return sendInvite(userId);
  }
  if (data === 'menu:top') {
    await done();
    return sendTop(userId);
  }
  if (data === 'menu:lang') {
    await done();
    return sendLangPicker(userId);
  }
  if (data === 'check_join') {
    const t = await tFor(userId);
    if (!(await refreshMembership(userId))) return done(t('notInChannel'), true);
    await done('🎉');
    // The menu replaces the join prompt; the button may sit under an older message too.
    await sendMenu(userId, t('joinedThanks'));
    if (query.message) await removeMessages(query.message.chat.id, [query.message.message_id]);
  }
  return done();
}
