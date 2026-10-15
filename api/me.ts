import { query } from '../lib/db.js';
import { env } from '../lib/env.js';
import { handler, json, requireAuth } from '../lib/http.js';
import { answeredKeys, activeSession } from '../lib/sessions.js';
import { parseRefPayload, referralLink } from '../lib/telegram.js';
import { getTest } from '../lib/tests.js';
import { refreshMembership, upsertUser } from '../lib/users.js';

/** Bootstrap for the Mini App: profile, channel gate, attempts, referral progress, history. */
export const POST = handler(async (req) => {
  const { user: tgUser, startParam } = requireAuth(req);
  // Opening the app via t.me/<bot>/<app>?startapp=ref_123 also counts as a referral.
  const user = await upsertUser(tgUser, parseRefPayload(startParam));
  const isMember = await refreshMembership(tgUser.id);
  const fresh = (await query('SELECT attempts, ref_qualified_count FROM users WHERE id = $1', [tgUser.id]))[0];

  const active = await activeSession(tgUser.id);
  const history = await query(
    `SELECT id, test_id, score, level, created_at FROM sessions
     WHERE user_id = $1 AND status = 'done' ORDER BY created_at DESC LIMIT 20`,
    [tgUser.id],
  );
  const per = env.referralsPerAttempt;
  const qualified = Number(fresh.ref_qualified_count);
  return json({
    user: { id: tgUser.id, firstName: user.first_name, attempts: Number(fresh.attempts) },
    isMember,
    channelUrl: env.channelUrl,
    referral: { link: referralLink(tgUser.id), qualified, per, progress: qualified % per },
    active: active
      ? { id: active.id, status: active.status, testTitle: getTest(active.test_id)?.title, answered: await answeredKeys(active.id) }
      : null,
    history: history.map((h) => ({ id: h.id, title: getTest(h.test_id)?.title ?? h.test_id, score: h.score, level: h.level, date: h.created_at })),
  });
});
