// Business rules. Keys, the channel, admins and the Mini App link come from .env
// (see .env.example), shipped as lib/env.js by `npm run deploy`.
import { ENV } from './env.js';

export const CHANNEL_ID = ENV.CHANNEL_ID; // students must join it; the bot must be an admin there
export const CHANNEL_URL = ENV.CHANNEL_URL;
export const ADMIN_IDS = ENV.ADMIN_IDS; // Telegram user ids with access to /admin
export const SUPPORT_CONTACT = ENV.SUPPORT_CONTACT;
export const APP_URL = ENV.APP_URL; // Mini App link (https://app<id>.tgcloud.ai/)

export const OPENAI_MODEL = ENV.OPENAI_MODEL;

export const FREE_ATTEMPTS = 1; // free tests for every new user
export const REFERRALS_PER_ATTEMPT = 3; // friends who join the channel per +1 test

// Free single-part practice per user per day (UTC). It doesn't use tests.
export const DRILLS_PER_DAY = 3;

// Unfinished tests stop accepting answers after this long (they can still be graded).
export const SESSION_TTL_SEC = 3 * 60 * 60;

// Test packs sold for Telegram Stars (currency XTR). Payments are OFF until an
// admin turns them on in /admin. Editing a price only affects new invoices.
export const STAR_PACKS = [
  { id: 'p1', attempts: 1, stars: 50 },
  { id: 'p3', attempts: 3, stars: 125 },
  { id: 'p10', attempts: 10, stars: 350 },
];
