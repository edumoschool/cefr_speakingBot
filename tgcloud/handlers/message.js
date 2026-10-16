// handlers/message.js — private chat with the bot.
import { api, db } from 'sdk';
import { sql } from 'sdk/db';
import { ADMIN_IDS, CHANNEL_ID, CHANNEL_URL, REFERRALS_PER_ATTEMPT, SUPPORT_CONTACT } from '../lib/config.js';
import { creditPayment, packsKeyboard, paymentsEnabled, refundPayment, setPaymentsEnabled } from '../lib/payments.js';
import { KEYS, setSetting } from '../lib/settings.js';
import { getUser, grantAttempts, openAppKeyboard, refreshMembership, upsertUser } from '../lib/users.js';
import { parseRefPayload } from '../lib/util.js';
import { finishInChat, onVoice, startChatMock } from '../lib/chatmode.js';

export default async function (message) {
  if (message.chat?.type !== 'private' || !message.from || message.from.is_bot) return;
  const from = message.from;
  const [cmd, ...args] = (message.text ?? '').trim().split(/\s+/);
  const isAdmin = ADMIN_IDS.includes(from.id);

  if (cmd === '/start') {
    await upsertUser(from, parseRefPayload(args[0]));
    if (args[0] === 'voice') return startChatMock(from.id);
    if (args[0] === 'buy' && (await paymentsEnabled())) {
      return api.sendMessage({ chat_id: from.id, text: '⭐ Get more speaking mocks with Telegram Stars:', reply_markup: packsKeyboard() });
    }
    return sendWelcome(from, await refreshMembership(from.id));
  }
  await upsertUser(from);

  // Stars purchase completed (see lib/payments.js).
  if (message.successful_payment) return creditPayment(message);

  // Answering a question of a chat-mode mock (see lib/chatmode.js).
  if (message.voice) return onVoice(message);

  switch (cmd) {
    case '/referral':
    case '/invite': {
      const u = await getUser(from.id);
      const per = REFERRALS_PER_ATTEMPT;
      const link = await referralLink(from.id);
      return api.sendMessage({
        chat_id: from.id,
        parse_mode: 'HTML',
        text: `👥 <b>Invite friends, get free mocks</b>\n\nYour link:\n${link}\n\n` +
          `Friends joined: <b>${u.ref_qualified_count}</b>\nProgress to next mock: <b>${u.ref_qualified_count % per}/${per}</b>\n` +
          `Attempts available: <b>${u.attempts}</b>`,
        reply_markup: { inline_keyboard: [[{ text: '📤 Share link', url: shareUrl(link) }]] },
      });
    }
    case '/buy':
      if (!(await paymentsEnabled())) return api.sendMessage({ chat_id: from.id, text: 'Purchases are not available right now. Invite friends to earn free mocks: /referral' });
      return api.sendMessage({ chat_id: from.id, text: '⭐ Get more speaking mocks with Telegram Stars:', reply_markup: packsKeyboard() });
    case '/paysupport':
      return api.sendMessage({
        chat_id: from.id,
        text: `💬 Payment support: ${SUPPORT_CONTACT}
Please include the payment code from your receipt. Unused purchases can be refunded.`,
      });
    case '/payments':
      if (!isAdmin) break;
      if (args[0] === 'on' || args[0] === 'off') await setPaymentsEnabled(args[0] === 'on');
      return api.sendMessage({ chat_id: from.id, text: `Payments are ${(await paymentsEnabled()) ? 'ON ⭐' : 'OFF'}. Use /payments on|off.` });
    case '/refund':
      if (!isAdmin) break;
      if (!args[0]) return api.sendMessage({ chat_id: from.id, text: 'Usage: /refund <telegram_payment_charge_id>' });
      try {
        return api.sendMessage({ chat_id: from.id, text: await refundPayment(args[0]) });
      } catch (e) {
        return api.sendMessage({ chat_id: from.id, text: `Refund failed: ${e.description ?? e.message}` });
      }
    case '/lang':
      return api.sendMessage({
        chat_id: from.id,
        text: '🌐 Feedback language / Fikr-mulohaza tili / Язык отзыва:',
        reply_markup: { inline_keyboard: [[
          { text: 'English', callback_data: 'lang:en' },
          { text: "O'zbekcha", callback_data: 'lang:uz' },
          { text: 'Русский', callback_data: 'lang:ru' },
        ]] },
      });
    case '/voice':
      return startChatMock(from.id);
    case '/finish':
      return finishInChat(from.id);
    case '/balance': {
      const u = await getUser(from.id);
      return api.sendMessage({ chat_id: from.id, text: `You have ${u.attempts} mock attempt(s).`, reply_markup: await openAppKeyboard() });
    }
    case '/setkey':
      if (isAdmin) return setKey(message, args);
      break;
    case '/setup':
      if (isAdmin) return setup(from.id, args[0]);
      break;
    case '/stats':
      if (isAdmin) return api.sendMessage({ chat_id: from.id, parse_mode: 'HTML', text: await statsText() });
      break;
    case '/grant':
      if (isAdmin) return grant(from.id, args);
      break;
  }
  return sendWelcome(from, await refreshMembership(from.id));
}

async function sendWelcome(from, member) {
  const intro =
    `👋 Hi${from.first_name ? ' ' + from.first_name : ''}! This bot runs full <b>Multilevel (CEFR) speaking mocks</b> with real exam ` +
    `questions and gives you an instant score out of 75, your CEFR level and detailed feedback.\n\n` +
    `🎁 Your first mock is <b>free</b>.\n👥 Every ${REFERRALS_PER_ATTEMPT} friends who join the channel through your link = <b>+1 mock</b> (/referral).`;
  if (member) {
    const app = await openAppKeyboard();
    const voice = [{ text: '🎙 Take it here with voice messages', callback_data: 'voice_mode' }];
    return api.sendMessage({
      chat_id: from.id,
      parse_mode: 'HTML',
      text: intro,
      reply_markup: { inline_keyboard: [...(app?.inline_keyboard ?? []), voice] },
    });
  }
  return api.sendMessage({
    chat_id: from.id,
    parse_mode: 'HTML',
    text: `${intro}\n\n🔒 To use the bot, please join our channel first, then tap “I've joined”.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 Join the channel', url: CHANNEL_URL }],
        [{ text: "✅ I've joined", callback_data: 'check_join' }],
      ],
    },
  });
}

async function referralLink(userId) {
  const me = await api.getMe();
  return `https://t.me/${me.username}?start=ref_${userId}`;
}

function shareUrl(link) {
  const text = '🎤 Practise the Multilevel speaking exam with instant AI scoring — your first mock is free!';
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

// /setkey openai sk-...   |   /setkey deepgram <key>
async function setKey(message, [name, value]) {
  const chat_id = message.chat.id;
  // Remove the key from the chat history first, whatever happens next.
  try {
    await api.deleteMessage({ chat_id, message_id: message.message_id });
  } catch {}
  if (!['openai', 'deepgram'].includes(name) || !value) {
    return api.sendMessage({ chat_id, text: 'Usage: /setkey openai <key>  or  /setkey deepgram <key>\n(the message is deleted automatically)' });
  }
  await setSetting(KEYS[name], value);
  return api.sendMessage({ chat_id, text: `✅ ${name} key saved (…${value.slice(-4)}).` });
}

// /setup https://app123.tgcloud.ai/  — the Mini App URL printed by `npx tgcloud push`
async function setup(chat_id, url) {
  if (!/^https:\/\/\S+$/.test(url ?? '')) {
    return api.sendMessage({ chat_id, text: 'Usage: /setup <Mini App URL printed by "npx tgcloud push">' });
  }
  const appUrl = url.replace(/\/+$/, '') + '/';
  await setSetting(KEYS.app_url, appUrl);
  await api.setChatMenuButton({ menu_button: { type: 'web_app', text: '🎤 Speaking Mock', web_app: { url: appUrl } } });
  await api.setMyCommands({
    commands: [
      { command: 'start', description: 'Open the speaking mock' },
      { command: 'voice', description: 'Take the mock here in chat with voice messages' },
      { command: 'referral', description: 'Invite friends and earn free mocks' },
      { command: 'lang', description: 'Feedback language: English / Oʻzbekcha / Русский' },
      { command: 'buy', description: 'Get more mocks with Telegram Stars' },
      { command: 'paysupport', description: 'Help with a payment' },
      { command: 'balance', description: 'How many mocks I have left' },
    ],
  });
  const me = await api.getMe();
  let adminOk = false;
  try {
    adminOk = (await api.getChatMember({ chat_id: CHANNEL_ID, user_id: me.id })).status === 'administrator';
  } catch {}
  return api.sendMessage({
    chat_id,
    text: `✅ Mini App URL set to ${appUrl}\nMenu button and commands updated.\n` +
      (adminOk ? '✅ Bot is an admin of the channel.' : '⚠️ Add the bot as an ADMIN of the channel — membership checks fail otherwise.'),
  });
}

// /grant <userId> <delta>
async function grant(chat_id, args) {
  const [uid, delta] = args.map(Number);
  if (!uid || !Number.isInteger(delta)) return api.sendMessage({ chat_id, text: 'Usage: /grant <userId> <attempts>' });
  const left = await grantAttempts(uid, delta, 'admin_grant');
  if (left === null) return api.sendMessage({ chat_id, text: 'User not found' });
  if (delta > 0) {
    try {
      await api.sendMessage({ chat_id: uid, text: `🎁 You received ${delta} mock attempt(s)!`, reply_markup: await openAppKeyboard() });
    } catch {}
  }
  return api.sendMessage({ chat_id, text: `Done. User ${uid} now has ${left} attempt(s).` });
}

async function statsText() {
  const u = await db.get(sql`SELECT count(*) AS users, sum(is_member) AS members,
      sum(referred_by IS NOT NULL) AS referred, sum(ref_qualified) AS qualified,
      sum(created_at > unixepoch() - 86400) AS new_24h FROM users`);
  const s = await db.get(sql`SELECT sum(status = 'done') AS done,
      sum(status = 'done' AND finished_at > unixepoch() - 86400) AS done_24h,
      sum(status = 'in_progress') AS open, round(avg(CASE WHEN status = 'done' THEN score END), 1) AS avg_score FROM sessions`);
  return `📊 <b>Stats</b>\nUsers: ${u.users} (+${u.new_24h ?? 0} in 24h)\nChannel members: ${u.members ?? 0}\n` +
    `Referred: ${u.referred ?? 0} (qualified ${u.qualified ?? 0})\n\nMocks graded: ${s.done ?? 0} (+${s.done_24h ?? 0} in 24h)\n` +
    `In progress: ${s.open ?? 0}\nAverage score: ${s.avg_score ?? '–'}/75`;
}
