// Weekly leaderboard: best full-mock score per student over the last 7 days.
// Computed on read, so it needs no scheduler.
import { db } from 'sdk';
import { sql } from 'sdk/db';

const WEEK = 7 * 24 * 3600;

export async function weeklyTop(limit = 10) {
  const rows = await db.all(sql`
    SELECT u.id, u.first_name, max(s.score) AS best, min(s.finished_at) AS first_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.kind = 'mock' AND s.status = 'done' AND s.finished_at >= unixepoch() - ${WEEK}
    GROUP BY u.id ORDER BY best DESC, first_at ASC LIMIT ${limit}`);
  return rows.map((r, i) => ({ rank: i + 1, userId: r.id, name: displayName(r.first_name), score: r.best, level: levelOf(r.best) }));
}

/** The user's own best this week and rank (null if they have no mock this week). */
export async function myWeeklyRank(userId) {
  const me = await db.get(sql`SELECT max(score) AS best FROM sessions
                              WHERE user_id = ${userId} AND kind = 'mock' AND status = 'done' AND finished_at >= unixepoch() - ${WEEK}`);
  if (me?.best == null) return null;
  const above = await db.get(sql`
    SELECT count(*) AS n FROM (
      SELECT user_id, max(score) AS best FROM sessions
      WHERE kind = 'mock' AND status = 'done' AND finished_at >= unixepoch() - ${WEEK}
      GROUP BY user_id) WHERE best > ${me.best}`);
  return { rank: above.n + 1, score: me.best };
}

// First name only, trimmed — never usernames or ids.
function displayName(first) {
  const n = String(first ?? '').trim().split(/\s+/)[0] || 'Student';
  return n.length > 14 ? n.slice(0, 13) + '…' : n;
}

function levelOf(score) {
  return score >= 65 ? 'C1' : score >= 51 ? 'B2' : score >= 38 ? 'B1' : 'Below B1';
}

export function leaderboardText(top) {
  const medal = (i) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
  if (!top.length) return '🏆 No mocks finished this week yet — be the first!';
  return `🏆 <b>Top speakers this week</b>\n\n` +
    top.map((t, i) => `${medal(i)} ${t.name} — <b>${t.score}/75</b> (${t.level})`).join('\n');
}
