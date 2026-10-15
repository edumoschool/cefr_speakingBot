import { timingSafeEqual } from 'node:crypto';
import { one, query } from '../lib/db.js';
import { env } from '../lib/env.js';
import { json } from '../lib/http.js';
import { parseRefPayload, referralLink, tg, tgSafe, type TgUser } from '../lib/telegram.js';
import { getUser, grantAttempts, openAppKeyboard, qualifyReferral, refreshMembership, upsertUser } from '../lib/users.js';

/** Telegram webhook. Always answers 200 so Telegram doesn't retry a failing update forever. */
export async function POST(req: Request): Promise<Response> {
  const got = Buffer.from(req.headers.get('x-telegram-bot-api-secret-token') ?? '');
  const want = Buffer.from(env.webhookSecret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response('forbidden', { status: 403 });

  try {
    const update = await req.json();
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
    else if (update.chat_member) await onChatMember(update.chat_member);
  } catch (e) {
    console.error('update failed', e);
  }
  return json({ ok: true });
}

function joinKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📢 Join the channel', url: env.channelUrl }],
      [{ text: "✅ I've joined", callback_data: 'check_join' }],
    ],
  };
}

async function sendWelcome(chatId: number, name: string | undefined, member: boolean) {
  const intro =
    `👋 Hi${name ? ' ' + name : ''}! This bot runs full <b>Multilevel (CEFR) speaking mocks</b> with real exam questions ` +
    `and gives you an instant score out of 75, your CEFR level, and detailed feedback.\n\n` +
    `🎁 Your first mock is <b>free</b>.\n👥 Every ${env.referralsPerAttempt} friends who join the channel through your link = <b>+1 mock</b>.`;
  if (member) {
    await tg('sendMessage', { chat_id: chatId, text: intro, parse_mode: 'HTML', reply_markup: openAppKeyboard() });
  } else {
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `${intro}\n\n🔒 To use the bot, please join our channel first, then tap "I've joined".`,
      reply_markup: joinKeyboard(),
    });
  }
}

async function onMessage(msg: any) {
  if (msg.chat?.type !== 'private' || !msg.from || msg.from.is_bot) return;
  const from = msg.from as TgUser;
  const text: string = msg.text ?? '';
  const [cmd, ...args] = text.trim().split(/\s+/);

  if (cmd === '/start') {
    await upsertUser(from, parseRefPayload(args[0]));
    const member = await refreshMembership(from.id);
    return sendWelcome(from.id, from.first_name, member);
  }

  await upsertUser(from);

  switch (cmd) {
    case '/referral':
    case '/invite': {
      const u = (await getUser(from.id))!;
      const per = env.referralsPerAttempt;
      return tg('sendMessage', {
        chat_id: from.id,
        parse_mode: 'HTML',
        text:
          `👥 <b>Invite friends, get free mocks</b>\n\nYour link:\n${referralLink(from.id)}\n\n` +
          `Friends joined: <b>${u.ref_qualified_count}</b>\nProgress to next mock: <b>${u.ref_qualified_count % per}/${per}</b>\n` +
          `Attempts available: <b>${u.attempts}</b>`,
        reply_markup: {
          inline_keyboard: [[{ text: '📤 Share link', url: shareUrl(from.id) }]],
        },
      });
    }
    case '/balance': {
      const u = (await getUser(from.id))!;
      return tg('sendMessage', { chat_id: from.id, text: `You have ${u.attempts} mock attempt(s).`, reply_markup: openAppKeyboard() });
    }
    case '/stats':
      if (!env.adminIds.includes(from.id)) break;
      return tg('sendMessage', { chat_id: from.id, parse_mode: 'HTML', text: await statsText() });
    case '/grant': {
      // /grant <userId> <delta>
      if (!env.adminIds.includes(from.id)) break;
      const [uid, delta] = args.map(Number);
      if (!uid || !Number.isInteger(delta)) return tg('sendMessage', { chat_id: from.id, text: 'Usage: /grant <userId> <attempts>' });
      const left = await grantAttempts(uid, delta, 'admin_grant');
      if (left === null) return tg('sendMessage', { chat_id: from.id, text: 'User not found' });
      if (delta > 0) await tgSafe('sendMessage', { chat_id: uid, text: `🎁 You received ${delta} mock attempt(s)!`, reply_markup: openAppKeyboard() });
      return tg('sendMessage', { chat_id: from.id, text: `Done. User ${uid} now has ${left} attempt(s).` });
    }
  }

  const member = await refreshMembership(from.id);
  return sendWelcome(from.id, from.first_name, member);
}

async function onCallback(cb: any) {
  const from = cb.from as TgUser;
  if (cb.data !== 'check_join') return tgSafe('answerCallbackQuery', { callback_query_id: cb.id });
  await upsertUser(from);
  const member = await refreshMembership(from.id);
  if (!member) {
    return tgSafe('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: "We couldn't see you in the channel yet. Join it and tap again.",
      show_alert: true,
    });
  }
  await tgSafe('answerCallbackQuery', { callback_query_id: cb.id, text: 'Thanks for joining! 🎉' });
  if (cb.message) await tgSafe('deleteMessage', { chat_id: cb.message.chat.id, message_id: cb.message.message_id });
  return sendWelcome(from.id, from.first_name, true);
}

/**
 * Channel join/leave events (the bot must be a channel admin and the webhook
 * must request "chat_member" updates). Lets referrals count even if the friend
 * never comes back to the bot after joining.
 */
async function onChatMember(upd: any) {
  const chat = upd.chat;
  const matches = String(chat.id) === env.channelId || (chat.username && `@${chat.username}`.toLowerCase() === env.channelId.toLowerCase());
  if (!matches) return;
  const userId = upd.new_chat_member?.user?.id;
  const status = upd.new_chat_member?.status;
  if (!userId) return;
  const member = ['member', 'administrator', 'creator'].includes(status) || (status === 'restricted' && upd.new_chat_member.is_member);
  const known = await one('UPDATE users SET is_member = $2 WHERE id = $1 RETURNING id', [userId, member]);
  if (known && member) await qualifyReferral(userId);
}

function shareUrl(userId: number) {
  const text = '🎤 Practise the Multilevel speaking exam with instant AI scoring — your first mock is free!';
  return `https://t.me/share/url?url=${encodeURIComponent(referralLink(userId))}&text=${encodeURIComponent(text)}`;
}

async function statsText() {
  const [u] = await query(
    `SELECT count(*) AS users,
            count(*) FILTER (WHERE is_member) AS members,
            count(*) FILTER (WHERE referred_by IS NOT NULL) AS referred,
            count(*) FILTER (WHERE ref_qualified) AS qualified,
            count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS new_24h
     FROM users`,
  );
  const [s] = await query(
    `SELECT count(*) FILTER (WHERE status = 'done') AS done,
            count(*) FILTER (WHERE status = 'done' AND finished_at > now() - interval '24 hours') AS done_24h,
            count(*) FILTER (WHERE status = 'in_progress') AS open,
            round(avg(score) FILTER (WHERE status = 'done'), 1) AS avg_score
     FROM sessions`,
  );
  return (
    `📊 <b>Stats</b>\nUsers: ${u.users} (+${u.new_24h} in 24h)\nChannel members: ${u.members}\n` +
    `Referred: ${u.referred} (qualified ${u.qualified})\n\nMocks graded: ${s.done} (+${s.done_24h} in 24h)\n` +
    `In progress: ${s.open}\nAverage score: ${s.avg_score ?? '–'}/75`
  );
}
