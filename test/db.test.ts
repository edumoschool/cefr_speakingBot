/**
 * Integration tests for attempts and referrals against a real Postgres.
 * Skipped unless TEST_DATABASE_URL is set (the schema is applied automatically).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url ?? 'postgres://unused';
process.env.BOT_TOKEN = '1:test';
process.env.BOT_USERNAME = 'test_bot';
process.env.CHANNEL_ID = '@test_channel';
process.env.APP_URL = 'https://example.test';
process.env.REFERRALS_PER_ATTEMPT = '3';
process.env.FREE_ATTEMPTS = '1';

const sent: any[] = [];
let channelMembers = new Set<number>();
globalThis.fetch = (async (input: any, init?: any) => {
  const method = String(input).split('/').pop();
  const body = JSON.parse(init?.body ?? '{}');
  if (method === 'sendMessage') sent.push(body);
  const result = method === 'getChatMember' ? { status: channelMembers.has(body.user_id) ? 'member' : 'left' } : true;
  return new Response(JSON.stringify({ ok: true, result }));
}) as typeof fetch;

const { query } = await import('../lib/db.js');
const users = await import('../lib/users.js');
const sessions = await import('../lib/sessions.js');

before(async () => {
  if (!url) return;
  await query('DROP TABLE IF EXISTS answers, sessions, attempt_ledger, users CASCADE');
  const schema = readFileSync('db/schema.sql', 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const s of schema.split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean)) await query(s);
});

const attempts = async (id: number) => Number((await query('SELECT attempts FROM users WHERE id = $1', [id]))[0].attempts);

test('new users get one free attempt; referrer only set for brand-new users', { skip: !url }, async () => {
  await users.upsertUser({ id: 100, first_name: 'Ref' });
  assert.equal(await attempts(100), 1);
  const u = await users.upsertUser({ id: 101 }, 100);
  assert.equal(u.referred_by, '100');
  // existing user can't be re-referred, self-referral and unknown referrers are ignored
  assert.equal((await users.upsertUser({ id: 101 }, 999)).referred_by, '100');
  assert.equal((await users.upsertUser({ id: 102 }, 102)).referred_by, null);
  assert.equal((await users.upsertUser({ id: 103 }, 55555)).referred_by, null);
});

test('every 3 referrals that join the channel give +1 attempt, exactly once each', { skip: !url }, async () => {
  for (const id of [201, 202, 203, 204, 205, 206, 207]) await users.upsertUser({ id }, 100);
  // not a member yet -> nothing
  assert.equal(await users.refreshMembership(201), false);
  assert.equal(await attempts(100), 1);

  channelMembers = new Set([101, 201, 202, 203, 204, 205, 206, 207]);
  // concurrent duplicate checks must not double count
  await Promise.all([users.refreshMembership(101), users.refreshMembership(101), users.refreshMembership(201)]);
  assert.equal(await attempts(100), 1);
  await users.refreshMembership(202); // 3rd qualified -> reward
  assert.equal(await attempts(100), 2);
  for (const id of [203, 204, 205]) await users.refreshMembership(id); // 6th -> reward
  assert.equal(await attempts(100), 3);
  await users.refreshMembership(206); // 7th -> no reward yet
  await users.refreshMembership(205); // already counted
  assert.equal(await attempts(100), 3);
  const [r] = await query('SELECT ref_qualified_count FROM users WHERE id = 100');
  assert.equal(r.ref_qualified_count, 7);
  const ledger = await query(`SELECT count(*)::int AS n FROM attempt_ledger WHERE user_id = 100 AND reason = 'referral_reward'`);
  assert.equal(ledger[0].n, 2);
  assert.ok(sent.some((m) => m.chat_id === 100 && /earned 1 more mock/.test(m.text)));
});

test('starting a mock spends exactly one attempt and allows one active session', { skip: !url }, async () => {
  await users.upsertUser({ id: 300 });
  const s = await sessions.startSession(300);
  assert.equal(await attempts(300), 0);
  await assert.rejects(sessions.startSession(300), (e: any) => e.code === 'active_session' || e.code === 'no_attempts');
  await users.grantAttempts(300, 2, 'admin_grant');
  await assert.rejects(sessions.startSession(300), (e: any) => e.code === 'active_session');
  assert.equal(await attempts(300), 2, 'failed start must not spend an attempt');
  assert.equal((await sessions.activeSession(300))!.id, s.id);
});

test('no attempts -> 402', { skip: !url }, async () => {
  await users.upsertUser({ id: 400 });
  await query('UPDATE users SET attempts = 0 WHERE id = 400');
  await assert.rejects(sessions.startSession(400), (e: any) => e.status === 402);
});

test('answers are stored once per question', { skip: !url }, async () => {
  const s = (await sessions.activeSession(300))!;
  const m = { wordCount: 1 } as any;
  assert.equal(await sessions.saveAnswer(s.id, 'p1_1_1', 'hello', m), true);
  assert.equal(await sessions.saveAnswer(s.id, 'p1_1_1', 'again', m), false);
  assert.deepEqual(await sessions.answeredKeys(s.id), ['p1_1_1']);
});
