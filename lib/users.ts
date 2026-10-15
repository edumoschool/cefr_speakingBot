import { one, query } from './db.js';
import { env } from './env.js';
import { isChannelMember, tgSafe, type TgUser } from './telegram.js';

export interface UserRow {
  id: string; // BIGINT comes back as string
  username: string | null;
  first_name: string | null;
  attempts: number;
  referred_by: string | null;
  ref_qualified: boolean;
  ref_qualified_count: number;
  is_member: boolean;
  blocked: boolean;
  inserted?: boolean;
}

/**
 * Creates the user on first contact (with the free attempt and, if valid, the
 * referrer) or refreshes their profile. A referrer is only ever set at creation,
 * so existing users can't be "re-referred".
 */
export async function upsertUser(u: TgUser, referrerId?: number): Promise<UserRow> {
  let ref: number | null = null;
  if (referrerId && referrerId !== u.id) {
    const exists = await one('SELECT 1 FROM users WHERE id = $1', [referrerId]);
    if (exists) ref = referrerId;
  }
  const row = (await one<UserRow>(
    `INSERT INTO users (id, username, first_name, language_code, attempts, referred_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       language_code = EXCLUDED.language_code,
       last_seen_at = now()
     RETURNING *, (xmax = 0) AS inserted`,
    [u.id, u.username ?? null, u.first_name ?? null, u.language_code ?? null, env.freeAttempts, ref],
  ))!;
  if (row.inserted && env.freeAttempts > 0) {
    await query('INSERT INTO attempt_ledger (user_id, delta, reason) VALUES ($1, $2, $3)', [u.id, env.freeAttempts, 'signup_free']);
  }
  return row;
}

export async function getUser(id: number): Promise<UserRow | undefined> {
  return one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
}

/**
 * Called whenever we learn a user is a channel member. The first time a
 * referred user is seen in the channel they count towards their referrer, and
 * every REFERRALS_PER_ATTEMPT qualified referrals grant the referrer +1 attempt.
 * Each step is a single atomic UPDATE, so concurrent calls can't double-count.
 */
export async function qualifyReferral(userId: number): Promise<{ referrerId: number; count: number; rewarded: boolean } | null> {
  const marked = await one<{ referred_by: string }>(
    `UPDATE users SET ref_qualified = TRUE
     WHERE id = $1 AND ref_qualified = FALSE AND referred_by IS NOT NULL
     RETURNING referred_by`,
    [userId],
  );
  if (!marked) return null;
  const referrerId = Number(marked.referred_by);
  const per = env.referralsPerAttempt;
  const r = (await one<{ ref_qualified_count: number; attempts: number }>(
    `UPDATE users SET
       ref_qualified_count = ref_qualified_count + 1,
       attempts = attempts + CASE WHEN (ref_qualified_count + 1) % $2 = 0 THEN 1 ELSE 0 END
     WHERE id = $1
     RETURNING ref_qualified_count, attempts`,
    [referrerId, per],
  ))!;
  const count = r.ref_qualified_count;
  const rewarded = count % per === 0;
  if (rewarded) {
    await query('INSERT INTO attempt_ledger (user_id, delta, reason, ref_user_id) VALUES ($1, 1, $2, $3)', [referrerId, 'referral_reward', userId]);
    await tgSafe('sendMessage', {
      chat_id: referrerId,
      text: `🎉 ${count} friends have joined through your link, so you've earned 1 more mock attempt.\nYou now have ${r.attempts} attempt(s).`,
      reply_markup: openAppKeyboard('🎤 Take a mock'),
    });
  } else {
    await tgSafe('sendMessage', {
      chat_id: referrerId,
      text: `👥 A friend joined through your link (${count % per}/${per}). ${per - (count % per)} more and you get a free mock.`,
    });
  }
  return { referrerId, count, rewarded };
}

/** Checks live membership, stores it, and settles a pending referral. */
export async function refreshMembership(userId: number): Promise<boolean> {
  const member = await isChannelMember(userId);
  await query('UPDATE users SET is_member = $2 WHERE id = $1', [userId, member]);
  if (member) await qualifyReferral(userId);
  return member;
}

export async function grantAttempts(userId: number, delta: number, reason: string): Promise<number | null> {
  const r = await one<{ attempts: number }>(
    'UPDATE users SET attempts = GREATEST(attempts + $2, 0) WHERE id = $1 RETURNING attempts',
    [userId, delta],
  );
  if (!r) return null;
  await query('INSERT INTO attempt_ledger (user_id, delta, reason) VALUES ($1, $2, $3)', [userId, delta, reason]);
  return r.attempts;
}

export function openAppKeyboard(text = '🎤 Open Speaking Mock') {
  return { inline_keyboard: [[{ text, web_app: { url: env.appUrl } }]] };
}
