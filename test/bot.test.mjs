// Runs the real tgcloud handlers and endpoints against the local sdk stand-in
// (node --import ./dev/register.mjs). OpenAI and Deepgram are faked via fake.fetch.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fake } from 'sdk';
import { _database, _reset, createSchema } from 'sdk/db';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import onChatMember from '../tgcloud/handlers/chat_member.js';
import me from '../tgcloud/endpoints/me.js';
import startMock from '../tgcloud/endpoints/start_mock.js';
import uploadAnswer from '../tgcloud/endpoints/upload_answer.js';
import gradePart from '../tgcloud/endpoints/grade_part.js';
import finishMock from '../tgcloud/endpoints/finish_mock.js';
import getResult from '../tgcloud/endpoints/get_result.js';
import createInvoice from '../tgcloud/endpoints/create_invoice.js';
import onPreCheckout from '../tgcloud/handlers/pre_checkout_query.js';
import setPrefs from '../tgcloud/endpoints/set_prefs.js';
import { CHANNEL_ID } from '../tgcloud/lib/config.js';

const ctx = (id, extra = {}) => ({ initData: { user: { id, first_name: `U${id}` }, ...extra } });
const msg = (id, text) => ({ message_id: 1, chat: { id, type: 'private' }, from: { id, first_name: `U${id}` }, text });
const q1 = (sql, ...p) => _database().prepare(sql).get(...p);
const attempts = (id) => q1('SELECT attempts FROM users WHERE id = ?', id).attempts;
const calls = { deepgram: 0, openai: 0 };

beforeEach(() => {
  _reset();
  createSchema(_database(), schema);
  fake.sent.length = 0;
  fake.channelMembers = new Set();
  calls.deepgram = calls.openai = 0;
  fake.fetch = async (url, init) => {
    if (url.startsWith('https://api.deepgram.com/')) {
      calls.deepgram++;
      assert.ok(init.body instanceof Uint8Array && init.body.length > 0);
      const words = 'well i think it depends on the situation because people are different'.split(' ')
        .map((w, i) => ({ word: w, start: i * 0.4, end: i * 0.4 + 0.3, confidence: 0.92 }));
      return Response.json({ results: { channels: [{ alternatives: [{ transcript: 'Well, I think it depends on the situation because people are different.', words }] }] } });
    }
    if (url.startsWith('https://api.openai.com/')) {
      calls.openai++;
      const body = JSON.parse(init.body);
      const name = body.response_format.json_schema.name;
      const content = name === 'summary'
        ? { overall_feedback: 'Solid B1 performance.', strengths: ['Clear'], priorities: ['Longer answers'] }
        : { fluency_coherence: 'B2', lexical_resource: 'B1+', grammar: 'B1', pronunciation: 'B2-', task_response: 'B1', feedback: 'ok',
            steps: JSON.parse(body.messages[1].content).answers.map((a) => ({ key: a.key, comment: 'fine' })),
            corrections: [{ original: 'people is', corrected: 'people are', explanation: 'plural' }], vocabulary_upgrades: [], pronunciation_tips: ['tip'] };
      return Response.json({ model: body.model, choices: [{ message: { content: JSON.stringify(content) } }] });
    }
    throw new Error('unexpected fetch ' + url);
  };
  q1("INSERT INTO settings (key, value) VALUES ('openai_api_key', 'sk-test'), ('deepgram_api_key', 'dg-test'), ('app_url', 'https://app1.tgcloud.ai/')");
});

test('start: new user gets 1 free attempt and a join prompt when not a member', async () => {
  await onMessage(msg(100, '/start'));
  assert.equal(attempts(100), 1);
  const welcome = fake.sent.find((c) => c.method === 'sendMessage');
  assert.equal(welcome.params.reply_markup.inline_keyboard[1][0].callback_data, 'check_join');
});

test('referrals: +1 attempt per 3 friends who join the channel, counted once', async () => {
  await onMessage(msg(100, '/start'));
  for (const id of [201, 202, 203, 204]) await onMessage(msg(id, '/start ref_100'));
  await onMessage(msg(205, '/start ref_100'));
  await onMessage(msg(205, '/start ref_201')); // existing user can't be re-referred
  await onMessage(msg(206, '/start ref_206')); // self-referral ignored
  assert.equal(q1('SELECT referred_by FROM users WHERE id = 205').referred_by, 100);
  assert.equal(q1('SELECT referred_by FROM users WHERE id = 206').referred_by, null);

  // joining without the bot knowing yet: nothing
  assert.equal(attempts(100), 1);
  // 201 taps "I've joined" (twice), 202 via channel event, 203 via Mini App
  fake.channelMembers = new Set([201, 202, 203, 204, 205]);
  await onCallback({ id: 'cb', from: { id: 201 }, data: 'check_join' });
  await onCallback({ id: 'cb', from: { id: 201 }, data: 'check_join' });
  await onChatMember({ chat: { id: -1, username: CHANNEL_ID.slice(1) }, new_chat_member: { status: 'member', user: { id: 202 } } });
  assert.equal(attempts(100), 1);
  await me({}, ctx(203));
  assert.equal(attempts(100), 2, '3rd qualified friend gives +1');
  await Promise.all([me({}, ctx(204)), me({}, ctx(204)), me({}, ctx(205))]);
  assert.equal(q1('SELECT ref_qualified_count c FROM users WHERE id = 100').c, 5);
  assert.equal(attempts(100), 2);
  assert.ok(fake.sent.some((c) => c.method === 'sendMessage' && c.params.chat_id === 100 && /earned 1 more mock/.test(c.params.text)));
  assert.equal(q1("SELECT count(*) n FROM attempt_ledger WHERE user_id = 100 AND reason = 'referral_reward'").n, 1);
});

test('mini app referral via start_param, channel gate on start_mock', async () => {
  await me({}, ctx(100));
  const r = await me({}, ctx(300, { start_param: 'ref_100' }));
  assert.equal(r.isMember, false);
  assert.equal(r.referral.link, 'https://t.me/dev_speaking_bot?start=ref_300');
  assert.equal(q1('SELECT referred_by FROM users WHERE id = 300').referred_by, 100);
  await assert.rejects(startMock({}, ctx(300)), (e) => e.parameters.code === 'NOT_MEMBER');
});

async function record(sessionId, key, bytes = 6000, chunk = 4000) {
  const b64 = Buffer.alloc(bytes, 7).toString('base64');
  const parts = [];
  for (let i = 0; i < b64.length; i += chunk) parts.push(b64.slice(i, i + chunk));
  let res;
  for (let i = 0; i < parts.length; i++) {
    res = await uploadAnswer({ session: sessionId, key, index: i, total: parts.length, mime: 'audio/webm;codecs=opus', data: parts[i] }, ctx(500));
  }
  return res;
}

test('full mock: spend attempt, chunked uploads, background part grading, finish', async () => {
  fake.channelMembers = new Set([500]);
  await me({}, ctx(500));
  const { session, test: t, answered } = await startMock({}, ctx(500));
  assert.equal(attempts(500), 0);
  assert.deepEqual(answered, []);
  // resuming returns the same session and does not spend again
  assert.equal((await startMock({}, ctx(500))).session.id, session.id);
  assert.equal(attempts(500), 0);

  for (const step of t.steps) {
    const r = await record(session.id, step.key);
    assert.equal(r.done, true);
    if (['p1_1_3', 'p1_2_3', 'p2'].includes(step.key)) await gradePart({ session: session.id, part: step.part }, ctx(500));
  }
  assert.equal(calls.deepgram, 8);
  assert.equal(q1('SELECT count(*) n FROM audio_chunks').n, 0, 'chunks are cleaned up');
  // re-sending the last chunk of an answered question does not re-transcribe
  assert.equal((await record(session.id, 'p3')).duplicate, true);
  assert.equal(calls.deepgram, 8);

  const done = await finishMock({ session: session.id }, ctx(500));
  assert.equal(calls.openai, 4 + 1, '4 parts + summary, each graded once');
  const r = done.result;
  assert.equal(r.answers.length, 8);
  // 12-word fake answers: the length guard caps fluency/task response well below the labels
  assert.ok(r.score > 20 && r.score < 51, `score ${r.score}`);
  assert.equal(r.parts.find((p) => p.part === '2').criteria.fluency_coherence, 'A1');
  assert.equal(r.overall, 'Solid B1 performance.');
  assert.ok(r.answers.every((a) => a.transcript && a.comment === 'fine'));
  // second finish returns the stored result without regrading or messaging again
  const sentBefore = fake.sent.filter((c) => c.method === 'sendMessage').length;
  assert.equal((await finishMock({ session: session.id }, ctx(500))).result.score, r.score);
  assert.equal(calls.openai, 5);
  assert.equal(fake.sent.filter((c) => c.method === 'sendMessage').length, sentBefore);
  assert.equal((await getResult({ id: session.id }, ctx(500))).result.score, r.score);
  // other users can't read it
  await assert.rejects(getResult({ id: session.id }, ctx(501)), (e) => e.parameters.code === 'NOT_FOUND');
  // no attempts left
  await assert.rejects(startMock({}, ctx(500)), (e) => e.parameters.code === 'NO_ATTEMPTS');
});

test('grading failure keeps the attempt and allows retry', async () => {
  fake.channelMembers = new Set([500]);
  await me({}, ctx(500));
  const { session } = await startMock({}, ctx(500));
  await record(session.id, 'p1_1_1');
  const realFetch = fake.fetch;
  fake.fetch = async (url, init) => (url.includes('openai') ? new Response('overloaded', { status: 503 }) : realFetch(url, init));
  await assert.rejects(finishMock({ session: session.id }, ctx(500)));
  assert.equal(q1('SELECT status FROM sessions WHERE id = ?', session.id).status, 'in_progress');
  assert.equal(q1("SELECT count(*) n FROM part_grades WHERE status = 'running'").n, 0);
  fake.fetch = realFetch;
  const r = await finishMock({ session: session.id }, ctx(500));
  assert.equal(r.result.parts.find((p) => p.part === '3').points, 0, 'unanswered part scores 0');
});

test('transcription failure keeps chunks so re-sending the last chunk retries', async () => {
  fake.channelMembers = new Set([500]);
  await me({}, ctx(500));
  const { session } = await startMock({}, ctx(500));
  const realFetch = fake.fetch;
  fake.fetch = async (url, init) => (url.includes('deepgram') ? new Response('err', { status: 500 }) : realFetch(url, init));
  await assert.rejects(record(session.id, 'p1_1_1'));
  fake.fetch = realFetch;
  const b64 = Buffer.alloc(6000, 7).toString('base64');
  const r = await uploadAnswer({ session: session.id, key: 'p1_1_1', index: 1, total: 2, mime: 'audio/webm', data: b64.slice(4000) }, ctx(500));
  assert.equal(r.done, true);
});

test('upload validation', async () => {
  fake.channelMembers = new Set([500]);
  await me({}, ctx(500));
  const { session } = await startMock({}, ctx(500));
  const bad = (input, code) => assert.rejects(uploadAnswer({ session: session.id, index: 0, total: 1, mime: 'audio/webm', data: 'AAAA', ...input }, ctx(500)), (e) => e.parameters.code === code);
  await bad({ key: 'nope' }, 'BAD_STEP');
  await bad({ key: 'p2', index: 3 }, 'BAD_REQUEST');
  await bad({ key: 'p2', data: 'A'.repeat(400_001) }, 'TOO_LARGE');
  await bad({ key: 'p2', data: '!!!!' }, 'BAD_REQUEST');
  await assert.rejects(uploadAnswer({ session: 'x', key: 'p2', index: 0, total: 1, data: 'AAAA' }, ctx(500)), (e) => e.parameters.code === 'BAD_REQUEST');
});

test('admin commands: /setkey deletes the message, non-admins are ignored', async () => {
  const { ADMIN_IDS } = await import('../tgcloud/lib/config.js');
  const admin = ADMIN_IDS[0];
  await onMessage(msg(admin, '/setkey openai sk-new-1234'));
  assert.equal(q1("SELECT value FROM settings WHERE key = 'openai_api_key'").value, 'sk-new-1234');
  assert.ok(fake.sent.some((c) => c.method === 'deleteMessage'));
  await onMessage(msg(999, '/setkey openai sk-evil'));
  assert.equal(q1("SELECT value FROM settings WHERE key = 'openai_api_key'").value, 'sk-new-1234');
  await onMessage(msg(admin, '/setup https://app42.tgcloud.ai'));
  assert.equal(q1("SELECT value FROM settings WHERE key = 'app_url'").value, 'https://app42.tgcloud.ai/');
  assert.ok(fake.sent.some((c) => c.method === 'setChatMenuButton'));
  await onMessage(msg(admin, '/grant 999 2'));
  assert.equal(attempts(999), 3);
});

// ---- chat voice mode (voice messages → api.getFileContent → same pipeline)
const voiceMsg = (id, fileId, duration, mid = 10) => ({
  message_id: mid, chat: { id, type: 'private' }, from: { id, first_name: `U${id}` },
  voice: { file_id: fileId, file_unique_id: fileId, duration, mime_type: 'audio/ogg', file_size: 6000 },
});

test('chat voice mode: whole mock via voice messages, graded once, result in chat', async () => {
  fake.channelMembers = new Set([600]);
  await onMessage(msg(600, '/start'));
  await onMessage(msg(600, '/voice'));
  assert.equal(attempts(600), 0, 'starting spends the attempt');
  // a voice with no answer yet asks question 1; part 1.2 pictures come from the hosted app
  let texts = () => fake.sent.filter((c) => c.method === 'sendMessage' && c.params.chat_id === 600).map((c) => c.params.text);
  assert.match(texts().at(-1), /question 1\/8/);

  for (let i = 0; i < 8; i++) {
    fake.files.set(`f${i}`, new Uint8Array(6000).fill(i + 1));
    await onMessage(voiceMsg(600, `f${i}`, 20, 100 + i));
    if (i === 2) assert.ok(fake.sent.some((c) => c.method === 'sendMediaGroup' && c.params.media[0].media.startsWith('https://app1.tgcloud.ai/img/')));
  }
  assert.equal(calls.deepgram, 8);
  assert.equal(calls.openai, 5, '4 parts + summary');
  const s = q1('SELECT status, score FROM sessions WHERE user_id = 600');
  assert.equal(s.status, 'done');
  const result = fake.sent.filter((c) => c.method === 'sendMessage' && c.params.chat_id === 600).at(-1);
  assert.match(result.params.text, new RegExp(`Score: <b>${s.score}/75</b>`));
  assert.equal(result.params.reply_markup.inline_keyboard[0][0].web_app.url.includes('#result='), true);

  // a stray voice after finishing doesn't spend anything or crash
  await onMessage(voiceMsg(600, 'f0', 10));
  assert.match(texts().at(-1), /no mock in progress/);
});

test('chat voice mode: limits and resume', async () => {
  fake.channelMembers = new Set([700]);
  await onMessage(msg(700, '/voice'));
  fake.files.set('long', new Uint8Array(6000).fill(1));
  await onMessage(voiceMsg(700, 'long', 30 + 16)); // part 1.1 limit is 30 s (+15 s grace)
  assert.equal(calls.deepgram, 0, 'over-long voice is not transcribed');
  assert.match(fake.sent.filter((c) => c.method === 'sendMessage').at(-1).params.text, /limit for this question is 30 s/);

  await onMessage(voiceMsg(700, 'long', 25));
  assert.equal(q1('SELECT count(*) n FROM answers').n, 1);
  // /voice again resumes at question 2 without spending another attempt
  await onMessage(msg(700, '/voice'));
  assert.match(fake.sent.filter((c) => c.method === 'sendMessage').at(-1).params.text, /question 2\/8/);
  // the Mini App sees the same open session with that answer
  const st = await startMock({}, ctx(700));
  assert.deepEqual(st.answered, ['p1_1_1']);
  // /finish grades what was answered
  await onMessage(msg(700, '/finish'));
  assert.equal(q1('SELECT status FROM sessions WHERE user_id = 700').status, 'done');
});

test('voice without a mock in progress points to /voice', async () => {
  await onMessage(msg(800, '/start'));
  fake.files.set('x', new Uint8Array(10));
  await onMessage(voiceMsg(800, 'x', 5));
  assert.match(fake.sent.filter((c) => c.method === 'sendMessage').at(-1).params.text, /Send \/voice/);
  assert.equal(calls.deepgram, 0);
});

test('expired mock with no answers is closed and refunded, so a new one can start', async () => {
  fake.channelMembers = new Set([900]);
  await me({}, ctx(900));
  const { session } = await startMock({}, ctx(900));
  assert.equal(attempts(900), 0);
  _database().prepare('UPDATE sessions SET created_at = created_at - 4 * 3600 WHERE id = ?').run(session.id);
  _database().prepare("INSERT INTO audio_chunks (session_id, step_key, idx, total, data, created_at) VALUES (?, 'p1_1_1', 0, 2, x'00', unixepoch() - 4 * 3600)").run(session.id);
  const m = await me({}, ctx(900));
  assert.equal(m.active, null);
  assert.equal(m.user.attempts, 1, 'attempt refunded');
  assert.equal(q1('SELECT status FROM sessions WHERE id = ?', session.id).status, 'expired');
  assert.equal(q1("SELECT count(*) n FROM attempt_ledger WHERE user_id = 900 AND reason = 'refund'").n, 1);
  assert.equal(q1('SELECT count(*) n FROM audio_chunks').n, 0, 'orphaned chunks removed');
  const next = await startMock({}, ctx(900));
  assert.notEqual(next.session.id, session.id);
  assert.equal(next.expired, false);
});

test('expired mock with answers goes to grading instead of blocking', async () => {
  fake.channelMembers = new Set([500]);
  await me({}, ctx(500));
  const { session } = await startMock({}, ctx(500));
  await record(session.id, 'p1_1_1');
  _database().prepare('UPDATE sessions SET created_at = created_at - 4 * 3600 WHERE id = ?').run(session.id);
  const m = await me({}, ctx(500));
  assert.equal(m.active.status, 'grading', 'home shows "See result"');
  const again = await startMock({}, ctx(500));
  assert.equal(again.session.id, session.id);
  assert.equal(again.expired, true);
  await assert.rejects(record(session.id, 'p1_1_2'), (e) => e.parameters.code === 'EXPIRED');
  const done = await finishMock({ session: session.id }, ctx(500));
  assert.ok(done.result.score >= 0);
  assert.equal(attempts(500), 0, 'graded mocks are not refunded');
});

// ---- Telegram Stars purchases
const lastSent = (method) => fake.sent.filter((c) => c.method === method).at(-1);
const paid = (userId, payload, amount, charge) => ({
  message_id: 50, chat: { id: userId, type: 'private' }, from: { id: userId, first_name: 'Buyer' },
  successful_payment: { currency: 'XTR', total_amount: amount, invoice_payload: payload, telegram_payment_charge_id: charge, provider_payment_charge_id: '' },
});

test('payments are off by default and only admins can turn them on', async () => {
  const { ADMIN_IDS } = await import('../tgcloud/lib/config.js');
  await onMessage(msg(1100, '/buy'));
  assert.match(lastSent('sendMessage').params.text, /not available/);
  assert.equal((await me({}, ctx(1100))).shop, null);
  await assert.rejects(createInvoice({ pack: 'p1' }, ctx(1100)), (e) => e.parameters.code === 'PAYMENTS_OFF');
  await onMessage(msg(1100, '/payments on')); // not an admin
  assert.equal((await me({}, ctx(1100))).shop, null);
  await onMessage(msg(ADMIN_IDS[0], '/payments on'));
  assert.equal((await me({}, ctx(1100))).shop.length, 3);
});

test('stars purchase: invoice, pre-checkout validation, credited exactly once, admin refund', async () => {
  const { ADMIN_IDS, STAR_PACKS } = await import('../tgcloud/lib/config.js');
  await onMessage(msg(ADMIN_IDS[0], '/payments on'));
  await onMessage(msg(1200, '/start'));
  const p3 = STAR_PACKS.find((p) => p.id === 'p3');

  await onCallback({ id: 'cb', from: { id: 1200 }, data: 'buy:p3' });
  const inv = lastSent('sendInvoice').params;
  assert.equal(inv.currency, 'XTR');
  assert.equal(inv.prices[0].amount, p3.stars);
  assert.equal(inv.payload, `pack:p3:${p3.attempts}:1200`);
  assert.ok((await createInvoice({ pack: 'p3' }, ctx(1200))).link);

  const pre = async (over) => {
    await onPreCheckout({ id: 'q', from: { id: 1200 }, currency: 'XTR', total_amount: p3.stars, invoice_payload: inv.payload, ...over });
    return lastSent('answerPreCheckoutQuery').params;
  };
  assert.equal((await pre({})).ok, true);
  assert.equal((await pre({ total_amount: 1 })).ok, false, 'tampered amount');
  assert.equal((await pre({ from: { id: 9999 } })).ok, false, 'someone else\'s invoice');
  assert.equal((await pre({ invoice_payload: 'pack:nope:1:1200' })).ok, false, 'unknown pack');
  await onMessage(msg(ADMIN_IDS[0], '/payments off'));
  assert.match((await pre({})).error_message, /paused/);
  await onMessage(msg(ADMIN_IDS[0], '/payments on'));

  // Telegram may redeliver the update: credit once
  await onMessage(paid(1200, inv.payload, p3.stars, 'charge-1'));
  await onMessage(paid(1200, inv.payload, p3.stars, 'charge-1'));
  assert.equal(attempts(1200), 1 + p3.attempts);
  assert.equal(q1("SELECT count(*) n FROM attempt_ledger WHERE user_id = 1200 AND reason = 'purchase'").n, 1);
  assert.match(lastSent('sendMessage').params.text, /3 speaking mocks added/);

  await onMessage(msg(ADMIN_IDS[0], '/refund charge-1'));
  assert.deepEqual(lastSent('refundStarPayment').params, { user_id: 1200, telegram_payment_charge_id: 'charge-1' });
  assert.equal(attempts(1200), 1);
  assert.equal(q1("SELECT status FROM payments WHERE charge_id = 'charge-1'").status, 'refunded');
  await onMessage(msg(ADMIN_IDS[0], '/refund charge-1'));
  assert.match(lastSent('sendMessage').params.text, /Already refunded/);
});

// ---- feedback language, progress history
test('feedback language: saved per user and passed to the examiner prompt', async () => {
  fake.channelMembers = new Set([1300]);
  assert.equal((await me({}, ctx(1300))).feedbackLang, 'en');
  await assert.rejects(setPrefs({ lang: 'de' }, ctx(1300)), (e) => e.parameters.code === 'BAD_REQUEST');
  await setPrefs({ lang: 'uz' }, ctx(1300));
  assert.equal((await me({}, ctx(1300))).feedbackLang, 'uz');
  await onCallback({ id: 'cb', from: { id: 1300 }, data: 'lang:ru' });
  assert.equal((await me({}, ctx(1300))).feedbackLang, 'ru');

  const prompts = [];
  const realFetch = fake.fetch;
  fake.fetch = async (url, init) => {
    if (url.includes('openai')) prompts.push(JSON.parse(init.body).messages[0].content);
    return realFetch(url, init);
  };
  const { session } = await startMock({}, ctx(1300));
  const b64 = Buffer.alloc(6000, 7).toString('base64');
  await uploadAnswer({ session: session.id, key: 'p1_1_1', index: 0, total: 1, mime: 'audio/webm', data: b64 }, ctx(1300));
  await finishMock({ session: session.id }, ctx(1300));
  fake.fetch = realFetch;
  assert.ok(prompts.length >= 2);
  assert.ok(prompts.every((p) => p.includes('LANGUAGE: write every explanation') && p.includes('Russian')));

  // progress: finished mocks come back with their criteria
  const h = (await me({}, ctx(1300))).history;
  assert.equal(h.length, 1);
  assert.deepEqual(Object.keys(h[0].criteria).sort(), ['fluency_coherence', 'grammar', 'lexical_resource', 'pronunciation', 'task_response']);
});

test('english feedback adds no language rule', async () => {
  fake.channelMembers = new Set([1400]);
  await me({}, ctx(1400));
  const prompts = [];
  const realFetch = fake.fetch;
  fake.fetch = async (url, init) => {
    if (url.includes('openai')) prompts.push(JSON.parse(init.body).messages[0].content);
    return realFetch(url, init);
  };
  const { session } = await startMock({}, ctx(1400));
  await uploadAnswer({ session: session.id, key: 'p1_1_1', index: 0, total: 1, mime: 'audio/webm', data: Buffer.alloc(6000, 7).toString('base64') }, ctx(1400));
  await finishMock({ session: session.id }, ctx(1400));
  fake.fetch = realFetch;
  assert.ok(prompts.length >= 2 && prompts.every((p) => !p.includes('LANGUAGE:')));
});
