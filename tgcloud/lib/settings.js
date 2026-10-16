import { db } from 'sdk';
import { sql } from 'sdk/db';

// API keys live in the database because the platform has no secret store:
// admins set them from the bot with /setkey (the message is deleted right away).
export const KEYS = { openai: 'openai_api_key', deepgram: 'deepgram_api_key', app_url: 'app_url', payments: 'payments' };

export async function getSetting(key) {
  const row = await db.get(sql`SELECT value FROM settings WHERE key = ${key}`);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  await db.run(sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
                   ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
}

export async function requireSetting(key, what) {
  const v = await getSetting(key);
  if (!v) throw new Error(`${what} is not configured — an admin must run /setkey`);
  return v;
}
