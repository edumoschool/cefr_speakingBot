// POST /api/me — bootstrap for the Mini App: profile, channel gate, attempts,
// referral progress, unfinished mock and history.
import { api, db } from 'sdk';
import { sql } from 'sdk/db';
import { CHANNEL_URL, REFERRALS_PER_ATTEMPT } from '../lib/config.js';
import { getTest } from '../lib/exam.js';
import { activeSession, answeredKeys } from '../lib/sessions.js';
import { parseRefPayload } from '../lib/util.js';
import { getUser, refreshMembership, upsertUser } from '../lib/users.js';

let botUsername;

export default async function (input, ctx) {
  const from = ctx.initData.user;
  // Opening the app via t.me/<bot>/<app>?startapp=ref_123 also counts as a referral.
  await upsertUser(from, parseRefPayload(ctx.initData.start_param));
  const isMember = await refreshMembership(from.id);
  const user = await getUser(from.id);
  botUsername ??= (await api.getMe()).username;

  const active = await activeSession(from.id);
  const history = await db.all(sql`SELECT id, test_id, score, level, created_at FROM sessions
                                   WHERE user_id = ${from.id} AND status = 'done' ORDER BY created_at DESC LIMIT 20`);
  const per = REFERRALS_PER_ATTEMPT;
  return {
    user: { id: from.id, firstName: user.first_name, attempts: user.attempts },
    isMember,
    channelUrl: CHANNEL_URL,
    referral: {
      link: `https://t.me/${botUsername}?start=ref_${from.id}`,
      qualified: user.ref_qualified_count,
      per,
      progress: user.ref_qualified_count % per,
    },
    active: active
      ? { id: active.id, status: active.status, testTitle: getTest(active.test_id)?.title, answered: await answeredKeys(active.id) }
      : null,
    history: history.map((h) => ({ id: h.id, title: getTest(h.test_id)?.title ?? h.test_id, score: h.score, level: h.level, date: h.created_at })),
  };
}
