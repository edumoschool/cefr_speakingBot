// handlers/message.js — private chat with the bot. Students mostly use buttons
// (lib/botui.js); typed commands still work. Admin tools: /admin (lib/admin.js).
import { api } from 'sdk';
import { onAdminButton, isAdmin, sendAdminPanel, statsText } from '../lib/admin.js';
import { sendBalance, sendInvite, sendLangPicker, sendMenu, sendPaySupport, sendTop, sendWelcome, setCommandMenus } from '../lib/botui.js';
import { finishInChat, onVoice, startChatMock } from '../lib/chatmode.js';
import { CHANNEL_ID } from '../lib/config.js';
import { creditPayment, packsKeyboard, paymentsEnabled, refundPayment, setPaymentsEnabled } from '../lib/payments.js';
import { KEYS, setSetting } from '../lib/settings.js';
import { tFor } from '../lib/texts.js';
import { grantAttempts, refreshMembership, upsertUser } from '../lib/users.js';
import { parseRefPayload } from '../lib/util.js';

export default async function (message) {
  if (message.chat?.type !== 'private' || !message.from || message.from.is_bot) return;
  const from = message.from;
  const [cmd, ...args] = (message.text ?? '').trim().split(/\s+/);
  const admin = isAdmin(from.id);

  if (cmd === '/start') {
    await upsertUser(from, parseRefPayload(args[0]));
    if (args[0] === 'voice') return startChatMock(from.id);
    if (args[0] === 'buy') return sendShop(from.id);
    return sendWelcome(from, await refreshMembership(from.id));
  }
  await upsertUser(from);

  // Stars purchase completed (lib/payments.js).
  if (message.successful_payment) return creditPayment(message);
  // An answer in a chat-mode test (lib/chatmode.js).
  if (message.voice) return onVoice(message);

  switch (cmd) {
    case '/menu':
      return sendMenu(from.id);
    case '/invite':
    case '/referral':
      return sendInvite(from.id);
    case '/top':
      return sendTop(from.id);
    case '/lang':
      return sendLangPicker(from.id);
    case '/voice':
      return startChatMock(from.id);
    case '/finish':
      return finishInChat(from.id);
    case '/balance':
      return sendBalance(from.id);
    case '/buy':
      return sendShop(from.id);
    case '/paysupport':
      return sendPaySupport(from.id);
  }

  if (admin) {
    switch (cmd) {
      case '/admin':
        return sendAdminPanel(from.id);
      case '/setkey':
        return setKey(message, args);
      case '/setup':
        return setup(from.id, args[0]);
      case '/stats':
        return api.sendMessage({ chat_id: from.id, parse_mode: 'HTML', text: await statsText() });
      case '/grant':
        return grant(from.id, args);
      case '/payments':
        if (args[0] === 'on' || args[0] === 'off') await setPaymentsEnabled(args[0] === 'on');
        return api.sendMessage({ chat_id: from.id, text: `Payments are ${(await paymentsEnabled()) ? 'ON ⭐' : 'OFF'}.` });
      case '/leaderboard':
        return onAdminButton({ id: '', from, data: 'adm:board', message: null });
      case '/refund':
        if (!args[0]) return api.sendMessage({ chat_id: from.id, text: 'Send: /refund PAYMENT_CODE (from the receipt)' });
        try {
          return api.sendMessage({ chat_id: from.id, text: await refundPayment(args[0]) });
        } catch (e) {
          return api.sendMessage({ chat_id: from.id, text: `Refund failed: ${e.description ?? e.message}` });
        }
    }
  }

  // Anything else (text, stickers, unknown commands): show the menu.
  if (!(await refreshMembership(from.id))) return sendWelcome(from, false);
  return sendMenu(from.id);
}

async function sendShop(userId) {
  const t = await tFor(userId);
  if (!(await paymentsEnabled())) return api.sendMessage({ chat_id: userId, text: t('buyOff') });
  return api.sendMessage({ chat_id: userId, text: t('buyTitle'), reply_markup: packsKeyboard() });
}

// /setkey openai sk-...   |   /setkey deepgram <key>
async function setKey(message, [name, value]) {
  const chat_id = message.chat.id;
  // Remove the key from the chat history first, whatever happens next.
  try {
    await api.deleteMessage({ chat_id, message_id: message.message_id });
  } catch {}
  if (!['openai', 'deepgram'].includes(name) || !value) {
    return api.sendMessage({ chat_id, text: 'Send: /setkey openai YOUR_KEY  or  /setkey deepgram YOUR_KEY\n(the message is deleted automatically)' });
  }
  await setSetting(KEYS[name], value);
  await api.sendMessage({ chat_id, text: `✅ ${name} key saved (…${value.slice(-4)}).` });
  return sendAdminPanel(chat_id);
}

// /setup https://app123.tgcloud.ai/  — the Mini App link printed by deploy
async function setup(chat_id, url) {
  if (!/^https:\/\/\S+$/.test(url ?? '')) {
    return api.sendMessage({ chat_id, text: 'Send: /setup YOUR_MINI_APP_LINK (printed by "npm run deploy", like https://app123.tgcloud.ai/)' });
  }
  const appUrl = url.replace(/\/+$/, '') + '/';
  await setSetting(KEYS.app_url, appUrl);
  await api.setChatMenuButton({ menu_button: { type: 'web_app', text: '🎤 Speaking test', web_app: { url: appUrl } } });
  await setCommandMenus();
  const me = await api.getMe();
  let adminOk = false;
  try {
    adminOk = (await api.getChatMember({ chat_id: CHANNEL_ID, user_id: me.id })).status === 'administrator';
  } catch {}
  await api.sendMessage({
    chat_id,
    text: `✅ Mini App link saved. The menu button and command lists (EN/UZ/RU) are updated.\n` +
      (adminOk ? '✅ The bot is an admin of your channel.' : '⚠️ Make the bot an ADMIN of your channel — otherwise it can’t check who joined.'),
  });
  return sendAdminPanel(chat_id);
}

// /grant <userId> <number>
async function grant(chat_id, args) {
  const [uid, delta] = args.map(Number);
  if (!uid || !Number.isInteger(delta)) return api.sendMessage({ chat_id, text: 'Send: /grant USER_ID NUMBER  (e.g. /grant 123456789 2)' });
  const left = await grantAttempts(uid, delta, 'admin_grant');
  if (left === null) return api.sendMessage({ chat_id, text: 'No student with that ID.' });
  if (delta > 0) {
    try {
      const t = await tFor(uid);
      await api.sendMessage({ chat_id: uid, text: t('granted', { n: delta }) });
    } catch {}
  }
  return api.sendMessage({ chat_id, text: `Done. Student ${uid} now has ${left} test(s).` });
}
