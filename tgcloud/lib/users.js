import { db, api } from 'sdk';
import { sql } from 'sdk/db';
import { CHANNEL_ID, FREE_ATTEMPTS, REFERRALS_PER_ATTEMPT } from './config.js';
import { getSetting, KEYS } from './settings.js';
import { tFor } from './texts.js';
import { returning } from './db.js';

/**
 * Creates the user on first contact (free attempt + referrer, if valid) or
 * refreshes their profile. The referrer is only ever set at creation, so an
 * existing user can't be "re-referred", and self-referral is ignored.
 * @returns {Promise<{user: object, created: boolean}>}
 */
export async function upsertUser(from, referrerId) {
  let ref = null;
  if (referrerId && referrerId !== from.id) {
    const exists = await db.get(sql`SELECT 1 AS x FROM users WHERE id = ${referrerId}`);
    if (exists) ref = referrerId;
  }
  const inserted = await returning(sql`
    INSERT INTO users (id, username, first_name, language_code, attempts, referred_by, feedback_lang)
    VALUES (${from.id}, ${from.username ?? null}, ${from.first_name ?? null}, ${from.language_code ?? null}, ${FREE_ATTEMPTS}, ${ref},
            ${langFromTelegram(from.language_code)})
    ON CONFLICT (id) DO NOTHING
    RETURNING id`);
  const created = inserted.length > 0;
  if (created) {
    if (FREE_ATTEMPTS > 0) {
      await db.run(sql`INSERT INTO attempt_ledger (user_id, delta, reason) VALUES (${from.id}, ${FREE_ATTEMPTS}, 'signup_free')`);
    }
  } else {
    await db.run(sql`UPDATE users SET username = ${from.username ?? null}, first_name = ${from.first_name ?? null},
                     language_code = ${from.language_code ?? null}, last_seen_at = unixepoch() WHERE id = ${from.id}`);
  }
  return { user: await getUser(from.id), created };
}

/** Initial app/feedback language from the Telegram interface language. */
export function langFromTelegram(code) {
  if (/^uz/i.test(code ?? '')) return 'uz';
  if (/^(ru|kk|ky|tg|be|uk)/i.test(code ?? '')) return 'ru';
  return 'en';
}

export async function getUser(id) {
  return db.get(sql`SELECT * FROM users WHERE id = ${id}`);
}

const MEMBER = new Set(['creator', 'administrator', 'member']);

/** Live channel membership check (the bot must be a channel admin). */
export async function isChannelMember(userId) {
  try {
    const m = await api.getChatMember({ chat_id: CHANNEL_ID, user_id: userId });
    return MEMBER.has(m.status) || (m.status === 'restricted' && m.is_member === true);
  } catch (e) {
    console.warn('getChatMember failed', e.description ?? String(e));
    return false;
  }
}

/** Checks membership, stores it, and settles a pending referral. */
export async function refreshMembership(userId) {
  const member = await isChannelMember(userId);
  await db.run(sql`UPDATE users SET is_member = ${member ? 1 : 0} WHERE id = ${userId}`);
  if (member) await qualifyReferral(userId);
  return member;
}

/**
 * The first time a referred user is seen in the channel they count for their
 * referrer; every REFERRALS_PER_ATTEMPT such users give the referrer +1 attempt.
 * Each step is one atomic UPDATE … RETURNING, so concurrent calls can't
 * double-count.
 */
export async function qualifyReferral(userId) {
  const marked = await returning(sql`
    UPDATE users SET ref_qualified = 1
    WHERE id = ${userId} AND ref_qualified = 0 AND referred_by IS NOT NULL
    RETURNING referred_by`);
  if (!marked.length) return null;
  const referrerId = marked[0].referred_by;
  const per = REFERRALS_PER_ATTEMPT;
  const [r] = await returning(sql`
    UPDATE users SET
      ref_qualified_count = ref_qualified_count + 1,
      attempts = attempts + CASE WHEN (ref_qualified_count + 1) % ${per} = 0 THEN 1 ELSE 0 END
    WHERE id = ${referrerId}
    RETURNING ref_qualified_count, attempts`);
  if (!r) return null;
  const count = r.ref_qualified_count;
  const rewarded = count % per === 0;
  if (rewarded) {
    await db.run(sql`INSERT INTO attempt_ledger (user_id, delta, reason, ref_user_id) VALUES (${referrerId}, 1, 'referral_reward', ${userId})`);
  }
  const t = await tFor(referrerId);
  await notify(referrerId, rewarded
    ? t('refReward', { count, attempts: r.attempts })
    : t('refJoined', { p: count % per, per, left: per - (count % per) }),
    rewarded ? t('btnTakeTest') : null);
  return { referrerId, count, rewarded };
}

export async function grantAttempts(userId, delta, reason) {
  const rows = await returning(sql`UPDATE users SET attempts = MAX(attempts + ${delta}, 0) WHERE id = ${userId} RETURNING attempts`);
  if (!rows.length) return null;
  await db.run(sql`INSERT INTO attempt_ledger (user_id, delta, reason) VALUES (${userId}, ${delta}, ${reason})`);
  return rows[0].attempts;
}

/** Inline keyboard with a button that opens the Mini App (once its URL is configured with /setup). */
export async function openAppKeyboard(text = '🎤 Open Speaking Mock', path = '') {
  const url = await getSetting(KEYS.app_url);
  return url ? { inline_keyboard: [[{ text, web_app: { url: url + path } }]] } : undefined;
}

async function notify(chatId, text, buttonText) {
  try {
    await api.sendMessage({ chat_id: chatId, text, reply_markup: buttonText ? await openAppKeyboard(buttonText) : undefined });
  } catch (e) {
    console.warn('notify failed', e.description ?? String(e)); // user may have blocked the bot
  }
}

export async function setFeedbackLang(userId, lang) {
  await db.run(sql`UPDATE users SET feedback_lang = ${lang} WHERE id = ${userId}`);
}
