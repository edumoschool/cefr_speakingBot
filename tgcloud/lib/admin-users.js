// Admin → Students: a paginated list of everyone who started the bot, a card per
// student (balance, tests, invites, purchases, history of their test balance)
// and buttons to give free tests. Everything redraws one message in place.
import { api, db } from 'sdk';
import { sql } from 'sdk/db';
import { tFor } from './texts.js';
import { grantAttempts } from './users.js';
import { escapeHtml } from './util.js';

export const PAGE_SIZE = 8;
const GRANT_STEPS = [1, 2, 5];

const day = (sec) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : '–');
const nameOf = (u) => [u.first_name || 'No name', u.username ? `@${u.username}` : ''].filter(Boolean).join(' ');

const REASONS = {
  signup_free: 'free test for joining',
  referral_reward: 'reward for 3 invited friends',
  mock_start: 'started a full test',
  refund: 'test returned (unfinished)',
  admin_grant: 'given by admin',
  purchase: 'bought with Stars',
  refund_purchase: 'Stars purchase refunded',
};

/** One page of students, most recently active first. `query` filters by name, @username or ID. */
export async function studentsPage(page = 0, query = '') {
  const q = query.trim().replace(/^@/, '');
  const like = `%${q}%`;
  const where = q
    ? sql`WHERE CAST(id AS TEXT) = ${q} OR username LIKE ${like} OR first_name LIKE ${like}`
    : sql``;
  const total = (await db.get(sql`SELECT count(*) AS n FROM users ${where}`)).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.min(Math.max(0, page), pages - 1);
  const rows = await db.all(sql`
    SELECT u.id, u.first_name, u.username, u.attempts, u.is_member,
           (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.status = 'done' AND s.kind = 'mock') AS done
    FROM users u ${where} ORDER BY u.last_seen_at DESC, u.id DESC LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`);

  const text =
    `👥 <b>Students</b> — ${total}${q ? ` matching “${escapeHtml(q)}”` : ''}\n` +
    (total ? `Page ${page + 1} of ${pages}. Tap a student to see details and give free tests.\n` : 'Nobody found.\n') +
    `\n🎟 = tests left · 🎤 = full tests finished · 📢 = in the channel\n` +
    `<i>Find someone: send</i> <code>/user name</code>, <code>/user @username</code> <i>or</i> <code>/user ID</code>`;
  const back = q ? 'adm:users:0' : 'adm:panel';
  const nav = [];
  if (page > 0) nav.push({ text: '◀️ Back', callback_data: listData(page - 1, q) });
  if (page < pages - 1) nav.push({ text: 'Next ▶️', callback_data: listData(page + 1, q) });
  const cardPage = q ? 0 : page; // a card opened from a search goes back to the full list
  return {
    text,
    reply_markup: {
      inline_keyboard: [
        ...rows.map((u) => [{
          text: `${u.is_member ? '📢 ' : ''}${nameOf(u)} · 🎟 ${u.attempts} · 🎤 ${u.done}`.slice(0, 60),
          callback_data: `adm:u:${u.id}:${cardPage}`,
        }]),
        ...(nav.length ? [nav] : []),
        [{ text: q ? '👥 All students' : '⬅️ Admin panel', callback_data: back }],
      ],
    },
  };
}

// The search text rides in the button (Telegram allows 64 bytes of callback data).
const listData = (page, q) => {
  const data = `adm:users:${page}${q ? `:${q}` : ''}`;
  return new TextEncoder().encode(data).length <= 64 ? data : `adm:users:${page}`;
};

/** The card of one student. `page` is the list page to go back to. */
export async function studentCard(userId, page = 0) {
  const u = await db.get(sql`SELECT * FROM users WHERE id = ${userId}`);
  if (!u) return { text: 'No student with that ID.', reply_markup: { inline_keyboard: [[{ text: '⬅️ Students', callback_data: `adm:users:${page}` }]] } };

  const tests = await db.all(sql`
    SELECT kind, drill_part, status, score, level, created_at, finished_at FROM sessions
    WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 6`);
  const c = await db.get(sql`
    SELECT sum(kind = 'mock' AND status = 'done') AS mocks, sum(kind = 'drill' AND status = 'done') AS drills,
           max(CASE WHEN kind = 'mock' AND status = 'done' THEN score END) AS best,
           sum(status IN ('in_progress', 'grading')) AS open
    FROM sessions WHERE user_id = ${userId}`);
  const pay = await db.get(sql`SELECT count(*) AS n, coalesce(sum(stars), 0) AS stars FROM payments WHERE user_id = ${userId} AND status = 'paid'`);
  const ledger = await db.all(sql`SELECT delta, reason, created_at FROM attempt_ledger WHERE user_id = ${userId} ORDER BY id DESC LIMIT 8`);
  const referrer = u.referred_by ? await db.get(sql`SELECT id, first_name, username FROM users WHERE id = ${u.referred_by}`) : null;

  const testLine = (s) => {
    const what = s.kind === 'drill' ? `Part ${s.drill_part} practice` : 'Full test';
    const result = s.status === 'done' ? `<b>${s.score}/75</b> (${escapeHtml(s.level ?? '')})` : s.status === 'expired' ? 'not finished' : '⏳ in progress';
    return `• ${day(s.finished_at ?? s.created_at)} — ${what}: ${result}`;
  };
  const ledgerLine = (l) => `• ${day(l.created_at)} ${l.delta > 0 ? '+' : ''}${l.delta} — ${REASONS[l.reason] ?? l.reason}`;

  const text =
    `👤 <b>${escapeHtml(nameOf(u))}</b>\n` +
    `ID: <code>${u.id}</code> · language: ${escapeHtml(u.feedback_lang)}\n` +
    `Joined ${day(u.created_at)} · last seen ${day(u.last_seen_at)}\n` +
    `${u.is_member ? '📢 In the channel' : '🚫 Not in the channel'}${u.blocked ? ' · ⛔ blocked the bot' : ''}\n\n` +
    `🎟 Tests left: <b>${u.attempts}</b>\n` +
    `🎤 Full tests finished: <b>${c.mocks ?? 0}</b>${c.best != null ? ` · best ${c.best}/75` : ''} · practice: ${c.drills ?? 0}` +
    `${c.open ? ' · ⏳ one in progress' : ''}\n` +
    `👥 Friends who joined: ${u.ref_qualified_count}` +
    `${referrer ? ` · invited by ${escapeHtml(nameOf(referrer))} (<code>${referrer.id}</code>)` : ''}\n` +
    `⭐ Purchases: ${pay.n}${pay.n ? ` (${pay.stars} Stars)` : ''}` +
    (tests.length ? `\n\n<b>Recent tests</b>\n${tests.map(testLine).join('\n')}` : '\n\nNo tests yet.') +
    (ledger.length ? `\n\n<b>Test balance history</b>\n${ledger.map(ledgerLine).join('\n')}` : '');

  return {
    text,
    reply_markup: {
      inline_keyboard: [
        GRANT_STEPS.map((n) => ({ text: `🎁 +${n}`, callback_data: `adm:g:${u.id}:${n}:${page}` })),
        [{ text: '➖ Take back 1', callback_data: `adm:g:${u.id}:-1:${page}` }, { text: '🔄 Refresh', callback_data: `adm:u:${u.id}:${page}` }],
        [{ text: '⬅️ Students', callback_data: `adm:users:${page}` }],
      ],
    },
  };
}

/** Gives (or takes back) tests and tells the student when they receive some. Returns a short toast text. */
export async function giveTests(userId, delta) {
  const left = await grantAttempts(userId, delta, 'admin_grant');
  if (left === null) return 'No student with that ID.';
  if (delta > 0) {
    try {
      const t = await tFor(userId);
      await api.sendMessage({ chat_id: userId, text: t('granted', { n: delta }) });
    } catch {} // they may have blocked the bot; the tests are still added
  }
  return delta > 0 ? `🎁 Gave ${delta} test${delta === 1 ? '' : 's'}. Now: ${left}` : `Took back ${-delta}. Now: ${left}`;
}
