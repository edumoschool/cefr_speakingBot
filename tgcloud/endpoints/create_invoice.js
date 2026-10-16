// POST /api/create_invoice — { pack }. A Stars invoice link the Mini App opens with Telegram.WebApp.openInvoice.
import { EndpointError } from 'sdk';
import { createInvoiceLink } from '../lib/payments.js';

export default async function (input, ctx) {
  const link = await createInvoiceLink(ctx.initData.user.id, String(input.pack ?? ''));
  if (!link) throw new EndpointError('Purchases are not available right now.', { code: 'PAYMENTS_OFF' });
  return { link };
}
