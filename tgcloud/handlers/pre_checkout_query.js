// handlers/pre_checkout_query.js — last check before a Stars payment goes through
// (Telegram cancels it if we don't answer within 10 seconds).
import { api } from 'sdk';
import { checkPreCheckout } from '../lib/payments.js';

export default async function (query) {
  const verdict = await checkPreCheckout(query);
  await api.answerPreCheckoutQuery({ pre_checkout_query_id: query.id, ...verdict });
}
