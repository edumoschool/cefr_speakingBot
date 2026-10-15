import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export async function tg<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
  return data.result;
}

/** Fire-and-forget variant for notifications that must never break the main flow. */
export async function tgSafe(method: string, params: Record<string, unknown>): Promise<void> {
  try {
    await tg(method, params);
  } catch (e) {
    console.warn(String(e));
  }
}

export interface InitData {
  user: TgUser;
  startParam?: string;
  authDate: number;
}

/**
 * Validates Telegram.WebApp.initData as described in
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(raw: string, botToken: string, maxAgeSec = 24 * 3600, now = Date.now()): InitData | null {
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;
  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    const user = JSON.parse(userJson) as TgUser;
    if (!user?.id) return null;
    return { user, startParam: params.get('start_param') ?? undefined, authDate };
  } catch {
    return null;
  }
}

const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);

/** Requires the bot to be an administrator of the channel. */
export async function isChannelMember(userId: number): Promise<boolean> {
  try {
    const m = await tg<{ status: string; is_member?: boolean }>('getChatMember', {
      chat_id: env.channelId,
      user_id: userId,
    });
    return MEMBER_STATUSES.has(m.status) || (m.status === 'restricted' && m.is_member === true);
  } catch (e) {
    console.warn('getChatMember failed', String(e));
    return false;
  }
}

export function referralLink(userId: number): string {
  return `https://t.me/${env.botUsername}?start=ref_${userId}`;
}

export function parseRefPayload(payload: string | undefined): number | undefined {
  const m = /^ref_(\d{1,20})$/.exec(payload ?? '');
  return m ? Number(m[1]) : undefined;
}
