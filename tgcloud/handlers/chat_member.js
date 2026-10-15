// handlers/chat_member.js — join/leave events in the channel (the bot must be a
// channel admin). Lets a referral count even if the friend never returns to the
// bot after joining.
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { CHANNEL_ID } from '../lib/config.js';
import { qualifyReferral } from '../lib/users.js';

export default async function (upd) {
  const chat = upd.chat;
  const ours = String(chat.id) === String(CHANNEL_ID) ||
    (chat.username && `@${chat.username}`.toLowerCase() === String(CHANNEL_ID).toLowerCase());
  if (!ours) return;
  const m = upd.new_chat_member;
  const userId = m?.user?.id;
  if (!userId) return;
  const member = ['member', 'administrator', 'creator'].includes(m.status) || (m.status === 'restricted' && m.is_member === true);
  const known = await db.all(sql`UPDATE users SET is_member = ${member ? 1 : 0} WHERE id = ${userId} RETURNING id`);
  if (known.length && member) await qualifyReferral(userId);
}
