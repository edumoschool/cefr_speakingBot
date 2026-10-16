// Selling extra mock attempts for Telegram Stars (currency XTR).
//   invoice → pre_checkout_query (validate, ≤10 s) → successful_payment (credit once)
import { api, db } from 'sdk';
import { sql } from 'sdk/db';
import { STAR_PACKS } from './config.js';
import { returning } from './db.js';
import { getSetting, KEYS, setSetting } from './settings.js';
import { openAppKeyboard } from './users.js';

export async function paymentsEnabled() {
  return (await getSetting(KEYS.payments)) === 'on';
}

export async function setPaymentsEnabled(on) {
  await setSetting(KEYS.payments, on ? 'on' : 'off');
}

export function getPack(id) {
  return STAR_PACKS.find((p) => p.id === id);
}

const plural = (n) => `${n} speaking mock${n === 1 ? '' : 's'}`;

/**
 * The attempt count travels in the payload, so a later price/pack edit never
 * changes what an already-issued invoice credits. Format: pack:<id>:<attempts>:<userId>
 */
function invoice(userId, pack) {
  return {
    title: plural(pack.attempts),
    description: `${plural(pack.attempts)} with AI scoring (score /75, CEFR level, detailed feedback).`,
    payload: `pack:${pack.id}:${pack.attempts}:${userId}`,
    currency: 'XTR',
    prices: [{ label: plural(pack.attempts), amount: pack.stars }],
  };
}

export function parsePayload(payload) {
  const m = /^pack:([\w-]{1,20}):(\d{1,3}):(\d{1,20})$/.exec(payload ?? '');
  return m ? { packId: m[1], attempts: Number(m[2]), userId: Number(m[3]) } : null;
}

export async function sendInvoice(chatId, packId) {
  const pack = getPack(packId);
  if (!pack || !(await paymentsEnabled())) return api.sendMessage({ chat_id: chatId, text: 'Purchases are not available right now.' });
  return api.sendInvoice({ chat_id: chatId, ...invoice(chatId, pack) });
}

/** For the Mini App: Telegram.WebApp.openInvoice(link). */
export async function createInvoiceLink(userId, packId) {
  const pack = getPack(packId);
  if (!pack || !(await paymentsEnabled())) return null;
  return api.createInvoiceLink(invoice(userId, pack));
}

/** Telegram waits ≤10 s for this answer before cancelling the payment. */
export async function checkPreCheckout(q) {
  const p = parsePayload(q.invoice_payload);
  const pack = p && getPack(p.packId);
  let error = null;
  if (!p || !pack) error = 'This offer is no longer available.';
  else if (!(await paymentsEnabled())) error = 'Purchases are paused right now. Please try again later.';
  else if (q.currency !== 'XTR' || q.total_amount !== pack.stars || p.attempts !== pack.attempts) error = 'The price has changed. Please open a new invoice.';
  else if (p.userId !== q.from.id) error = 'This invoice belongs to another user.';
  return error ? { ok: false, error_message: error } : { ok: true };
}

/**
 * Credits a successful payment exactly once (keyed by telegram_payment_charge_id;
 * Telegram may redeliver an update).
 */
export async function creditPayment(message) {
  const sp = message.successful_payment;
  const p = parsePayload(sp.invoice_payload);
  const userId = message.from.id;
  if (!p || p.userId !== userId) {
    console.error('unexpected payment payload', sp.invoice_payload, sp.telegram_payment_charge_id);
    return api.sendMessage({ chat_id: userId, text: `Thanks for your payment! Something looks off — please contact support (/paysupport) with code ${sp.telegram_payment_charge_id}.` });
  }
  const inserted = await returning(sql`
    INSERT INTO payments (charge_id, user_id, pack_id, stars, attempts)
    VALUES (${sp.telegram_payment_charge_id}, ${userId}, ${p.packId}, ${sp.total_amount}, ${p.attempts})
    ON CONFLICT DO NOTHING RETURNING charge_id`);
  if (!inserted.length) return; // already credited
  const [u] = await returning(sql`UPDATE users SET attempts = attempts + ${p.attempts} WHERE id = ${userId} RETURNING attempts`);
  await db.run(sql`INSERT INTO attempt_ledger (user_id, delta, reason) VALUES (${userId}, ${p.attempts}, 'purchase')`);
  return api.sendMessage({
    chat_id: userId,
    text: `⭐ Thank you! ${plural(p.attempts)} added — you now have ${u?.attempts ?? p.attempts} attempt(s).`,
    reply_markup: await openAppKeyboard('🎤 Take a mock'),
  });
}

/** Admin: refund a purchase in Stars and take back the attempts that are still unused. */
export async function refundPayment(chargeId) {
  const pay = await db.get(sql`SELECT * FROM payments WHERE charge_id = ${chargeId}`);
  if (!pay) return 'Payment not found.';
  if (pay.status === 'refunded') return 'Already refunded.';
  await api.refundStarPayment({ user_id: pay.user_id, telegram_payment_charge_id: chargeId });
  await db.run(sql`UPDATE payments SET status = 'refunded' WHERE charge_id = ${chargeId}`);
  const [u] = await returning(sql`UPDATE users SET attempts = MAX(attempts - ${pay.attempts}, 0) WHERE id = ${pay.user_id} RETURNING attempts`);
  await db.run(sql`INSERT INTO attempt_ledger (user_id, delta, reason) VALUES (${pay.user_id}, ${-pay.attempts}, 'refund_purchase')`);
  return `Refunded ${pay.stars} ⭐ to user ${pay.user_id}. They now have ${u?.attempts ?? 0} attempt(s).`;
}

export function packsKeyboard() {
  return { inline_keyboard: STAR_PACKS.map((p) => [{ text: `${plural(p.attempts)} — ${p.stars} ⭐`, callback_data: `buy:${p.id}` }]) };
}
