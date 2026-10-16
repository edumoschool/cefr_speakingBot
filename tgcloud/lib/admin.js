// Admin panel: one /admin message with buttons, so the owner doesn't need to
// remember commands. (The typed admin commands still work.)
import { api, db } from 'sdk';
import { sql } from 'sdk/db';
import { ADMIN_IDS, CHANNEL_ID } from './config.js';
import { weeklyTop } from './leaderboard.js';
import { paymentsEnabled, setPaymentsEnabled } from './payments.js';
import { getSetting, KEYS } from './settings.js';
import { boardText } from './botui.js';
import { tr } from './texts.js';

export const isAdmin = (id) => ADMIN_IDS.includes(id);

async function panel() {
  const pay = await paymentsEnabled();
  const [openai, deepgram, appUrl] = await Promise.all([getSetting(KEYS.openai), getSetting(KEYS.deepgram), getSetting(KEYS.app_url)]);
  const ok = (v) => (v ? '✅' : '❌');
  const text =
    `🛠 <b>Admin panel</b>\n\n` +
    `${ok(openai)} OpenAI key   ${ok(deepgram)} Deepgram key   ${ok(appUrl)} Mini App link\n` +
    `⭐ Payments: <b>${pay ? 'ON' : 'OFF'}</b>` +
    (openai && deepgram && appUrl ? '' : `\n\n<b>To finish setup</b>, send:\n` +
      (openai ? '' : '• <code>/setkey openai sk-…</code>\n') +
      (deepgram ? '' : '• <code>/setkey deepgram …</code>\n') +
      (appUrl ? '' : '• <code>/setup https://app…tgcloud.ai/</code> (the link printed by deploy)\n') +
      `(messages with keys are deleted automatically)`);
  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Statistics', callback_data: 'adm:stats' }],
        [{ text: '🏆 Post top speakers to the channel', callback_data: 'adm:board' }],
        [{ text: pay ? '⭐ Turn payments OFF' : '⭐ Turn payments ON', callback_data: 'adm:pay' }],
        [{ text: '🎁 How to give a student free tests', callback_data: 'adm:grant' }],
        [{ text: '🔄 Refresh', callback_data: 'adm:panel' }],
      ],
    },
  };
}

export async function sendAdminPanel(chatId) {
  const p = await panel();
  return api.sendMessage({ chat_id: chatId, parse_mode: 'HTML', ...p });
}

export async function statsText() {
  const u = await db.get(sql`SELECT count(*) AS users, sum(is_member) AS members,
      sum(referred_by IS NOT NULL) AS referred, sum(ref_qualified) AS qualified,
      sum(created_at > unixepoch() - 86400) AS new_24h FROM users`);
  const s = await db.get(sql`SELECT sum(status = 'done' AND kind = 'mock') AS done,
      sum(status = 'done' AND kind = 'drill') AS drills,
      sum(status = 'done' AND finished_at > unixepoch() - 86400) AS done_24h,
      sum(status = 'in_progress') AS open,
      round(avg(CASE WHEN status = 'done' AND kind = 'mock' THEN score END), 1) AS avg_score FROM sessions`);
  const p = await db.get(sql`SELECT count(*) AS n, coalesce(sum(stars), 0) AS stars FROM payments WHERE status = 'paid'`);
  return `📊 <b>Statistics</b>\n\n` +
    `👤 Students: <b>${u.users}</b> (+${u.new_24h ?? 0} today)\n` +
    `📢 In the channel: <b>${u.members ?? 0}</b>\n` +
    `👥 Came by invite: <b>${u.referred ?? 0}</b> (joined the channel: ${u.qualified ?? 0})\n\n` +
    `🎤 Full tests finished: <b>${s.done ?? 0}</b> · practice: ${s.drills ?? 0} (+${s.done_24h ?? 0} today)\n` +
    `⏳ In progress now: ${s.open ?? 0}\n` +
    `📈 Average score: <b>${s.avg_score ?? '–'}</b>/75\n\n` +
    `⭐ Purchases: ${p.n} (${p.stars} Stars)`;
}

/** Admin button taps (callback_data "adm:*"). */
export async function onAdminButton(query) {
  const chat_id = query.from.id;
  const action = query.data.slice(4);
  const message_id = query.message?.message_id;
  // Typed commands reuse these actions without a button tap to answer.
  const answer = (text) => (query.id ? api.answerCallbackQuery({ callback_query_id: query.id, text }) : text && api.sendMessage({ chat_id, text }));

  if (action === 'stats') {
    await answer();
    return api.sendMessage({ chat_id, parse_mode: 'HTML', text: await statsText() });
  }
  if (action === 'pay') {
    await setPaymentsEnabled(!(await paymentsEnabled()));
    await answer((await paymentsEnabled()) ? 'Payments are ON' : 'Payments are OFF');
  } else if (action === 'board') {
    const me = await api.getMe();
    try {
      await api.sendMessage({
        chat_id: CHANNEL_ID,
        parse_mode: 'HTML',
        text: boardText(tr('en'), await weeklyTop(10)) + '\n\n🎤 Practise the Multilevel speaking test — your first test is free:',
        reply_markup: { inline_keyboard: [[{ text: '🎁 Take a free test', url: `https://t.me/${me.username}?start=board` }]] },
      });
      if (!query.id) return answer('✅ Posted to the channel');
      await answer('✅ Posted to the channel');
    } catch (e) {
      const text = `Could not post: ${e.description ?? e.message}. Give the bot "Post messages" rights in the channel.`;
      return query.id ? api.answerCallbackQuery({ callback_query_id: query.id, show_alert: true, text }) : api.sendMessage({ chat_id, text });
    }
  } else if (action === 'grant') {
    await answer();
    return api.sendMessage({
      chat_id,
      parse_mode: 'HTML',
      text: 'Send <code>/grant USER_ID NUMBER</code>, e.g. <code>/grant 123456789 2</code>.\nThe student gets a message. Students can see their ID in the app: Settings → Need help?',
    });
  } else await answer();

  // Redraw the panel in place.
  const p = await panel();
  if (message_id) {
    try {
      return await api.editMessageText({ chat_id, message_id, parse_mode: 'HTML', ...p });
    } catch {}
  }
  return api.sendMessage({ chat_id, parse_mode: 'HTML', ...p });
}
