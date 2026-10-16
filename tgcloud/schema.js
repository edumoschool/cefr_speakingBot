import { table, integer, text, boolean, json, blob, index, uniqueIndex, primaryKey, sql } from 'sdk/db';

// Note: the platform has no foreign keys; integrity is enforced in lib/ code.

export const users = table('users', {
  id: integer('id').primaryKey(), // Telegram user id
  username: text('username'),
  firstName: text('first_name'),
  languageCode: text('language_code'),
  attempts: integer('attempts').notNull().default(0),
  referredBy: integer('referred_by'), // set only when the user is created
  refQualified: boolean('ref_qualified').notNull().default(false), // counted for their referrer
  refQualifiedCount: integer('ref_qualified_count').notNull().default(0), // my referrals who joined
  isMember: boolean('is_member').notNull().default(false),
  blocked: boolean('blocked').notNull().default(false),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  lastSeenAt: integer('last_seen_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  referredByIdx: index('idx_users_referred_by').on(t.referredBy),
}));

// Every change to an attempt balance, for auditing and support.
export const attemptLedger = table('attempt_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(), // signup_free | referral_reward | mock_start | refund | admin_grant | purchase
  refUserId: integer('ref_user_id'),
  sessionId: text('session_id'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('idx_ledger_user').on(t.userId),
}));

export const sessions = table('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  testId: text('test_id').notNull(),
  status: text('status').notNull().default('in_progress'), // in_progress | grading | done | expired
  score: integer('score'), // 0..75
  level: text('level'), // Below B1 | B1 | B2 | C1
  result: json('result'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  finishedAt: integer('finished_at'),
}, (t) => ({
  userIdx: index('idx_sessions_user').on(t.userId, t.createdAt),
  // At most one unfinished mock per user.
  oneActive: uniqueIndex('uidx_sessions_one_active').on(t.userId).where(sql`status IN ('in_progress', 'grading')`),
}));

export const answers = table('answers', {
  sessionId: text('session_id').notNull(),
  stepKey: text('step_key').notNull(), // p1_1_1 … p2, p3
  transcript: text('transcript').notNull(),
  metrics: json('metrics').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.stepKey] }),
}));

// Recordings arrive as base64 JSON chunks; assembled and deleted once complete.
export const audioChunks = table('audio_chunks', {
  sessionId: text('session_id').notNull(),
  stepKey: text('step_key').notNull(),
  idx: integer('idx').notNull(),
  total: integer('total').notNull(),
  data: blob('data').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.stepKey, t.idx] }),
}));

// Each part is graded in the background as soon as its answers are in.
export const partGrades = table('part_grades', {
  sessionId: text('session_id').notNull(),
  part: text('part').notNull(), // 1.1 | 1.2 | 2 | 3
  status: text('status').notNull(), // running | done
  result: json('result'),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.part] }),
}));

// API keys and runtime settings, set by admins from the bot (/setkey, /setup).
export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
