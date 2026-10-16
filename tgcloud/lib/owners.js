// Who runs the bot. The owner is found automatically: the creator of the channel
// students must join (the bot is an admin there, so it may ask Telegram). Anyone
// in ADMIN_IDS (.env, optional) is an admin too. The answer is cached for a few
// hours so normal messages cost one small DB read.
import { api } from 'sdk';
import { ADMIN_IDS, CHANNEL_ID } from './config.js';
import { getSetting, KEYS, setSetting } from './settings.js';

const RECHECK_SEC = 6 * 3600;
const RETRY_SEC = 300; // after a failed lookup (bot not admin yet), try again soon

async function channelOwner() {
  let cached = null;
  try {
    cached = JSON.parse((await getSetting(KEYS.owner)) ?? 'null');
  } catch {}
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.at < (cached.id ? RECHECK_SEC : RETRY_SEC)) return cached.id;
  let id = cached?.id ?? null; // keep the last known owner if Telegram can't be asked right now
  try {
    const admins = await api.getChatAdministrators({ chat_id: CHANNEL_ID });
    const creator = Array.isArray(admins) ? admins.find((m) => m.status === 'creator' && !m.user?.is_bot) : null;
    if (creator) id = creator.user.id;
  } catch (e) {
    console.warn('owner lookup failed', e.description ?? String(e));
  }
  await setSetting(KEYS.owner, JSON.stringify({ id, at: now }));
  return id;
}

/** Everyone with admin rights: the channel creator plus ADMIN_IDS. */
export async function adminIds() {
  const owner = CHANNEL_ID ? await channelOwner() : null;
  return [...new Set([...(owner ? [owner] : []), ...ADMIN_IDS])];
}

export async function isAdmin(id) {
  return (await adminIds()).includes(id);
}

/** For the admin panel: the detected channel owner (or null). */
export async function detectedOwner() {
  return CHANNEL_ID ? channelOwner() : null;
}
