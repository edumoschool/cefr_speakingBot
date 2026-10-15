import { timingSafeEqual } from 'node:crypto';
import { env } from '../../lib/env.js';
import { handler, HttpError, json } from '../../lib/http.js';
import { tg } from '../../lib/telegram.js';

/**
 * One-time (idempotent) bot setup after deploy:
 *   GET /api/admin/setup?key=<ADMIN_SECRET>
 * Registers the webhook, the chat menu button that opens the Mini App, the
 * command list, and checks the bot is an admin of the channel.
 */
export const GET = handler(async (req) => {
  const key = Buffer.from(new URL(req.url).searchParams.get('key') ?? '');
  const want = Buffer.from(env.adminSecret);
  if (key.length !== want.length || !timingSafeEqual(key, want)) throw new HttpError(403, 'forbidden', 'forbidden');

  await tg('setWebhook', {
    url: `${env.appUrl}/api/telegram`,
    secret_token: env.webhookSecret,
    allowed_updates: ['message', 'callback_query', 'chat_member'],
    drop_pending_updates: false,
  });
  await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: '🎤 Speaking Mock', web_app: { url: env.appUrl } } });
  await tg('setMyCommands', {
    commands: [
      { command: 'start', description: 'Open the speaking mock' },
      { command: 'referral', description: 'Invite friends and earn free mocks' },
      { command: 'balance', description: 'How many mocks I have left' },
    ],
  });
  const me = await tg<{ id: number; username: string }>('getMe');
  let botIsChannelAdmin = false;
  try {
    const m = await tg<{ status: string }>('getChatMember', { chat_id: env.channelId, user_id: me.id });
    botIsChannelAdmin = m.status === 'administrator';
  } catch {}
  const webhook = await tg('getWebhookInfo');
  return json({
    ok: true,
    bot: me.username,
    botIsChannelAdmin,
    warning: botIsChannelAdmin ? undefined : 'Add the bot as an administrator of the channel, otherwise membership checks will fail.',
    webhook,
  });
});
