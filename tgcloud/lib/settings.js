import { db } from 'sdk';
import { sql } from 'sdk/db';

// Runtime switches an admin can flip from the bot (/admin). API keys are NOT
// stored here: they come from .env (lib/env.js).
export const KEYS = { payments: 'payments', lastError: 'last_error', lastAlertAt: 'last_alert_at', owner: 'owner' };
/** Per-admin state, e.g. waiting for a search text. */
export const adminKey = (name, adminId) => `${name}:${adminId}`;

export async function getSetting(key) {
  const row = await db.get(sql`SELECT value FROM settings WHERE key = ${key}`);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  await db.run(sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
                   ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
}
