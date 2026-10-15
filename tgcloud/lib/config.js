// Project settings that are safe to commit. API keys are NOT here: an admin
// sets them from the bot with /setkey (stored in the `settings` table).

// Channel users must join. The bot must be an administrator of this channel.
export const CHANNEL_ID = '@your_channel'; // or a numeric id like -1001234567890
export const CHANNEL_URL = 'https://t.me/your_channel';

// Telegram user ids allowed to use /setkey, /setup, /stats and /grant.
export const ADMIN_IDS = [123456789];

export const FREE_ATTEMPTS = 1; // free mocks for every new user
export const REFERRALS_PER_ATTEMPT = 3; // friends who join the channel per +1 attempt

export const OPENAI_MODEL = 'gpt-5.4-mini'; // any chat model with json_schema structured outputs
export const DEEPGRAM_MODEL = 'nova-3';

// Unfinished mocks stop accepting answers after this long (they can still be graded).
export const SESSION_TTL_SEC = 3 * 60 * 60;
