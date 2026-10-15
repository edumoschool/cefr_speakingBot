function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

export const env = {
  get botToken() { return required('BOT_TOKEN'); },
  get botUsername() { return required('BOT_USERNAME').replace(/^@/, ''); },
  get channelId() { return required('CHANNEL_ID'); },
  get channelUrl() {
    const id = process.env.CHANNEL_ID ?? '';
    return process.env.CHANNEL_URL || (id.startsWith('@') ? `https://t.me/${id.slice(1)}` : '');
  },
  get webhookSecret() { return required('WEBHOOK_SECRET'); },
  get adminSecret() { return required('ADMIN_SECRET'); },
  get adminIds(): number[] {
    return (process.env.ADMIN_IDS ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  },
  get appUrl() { return required('APP_URL').replace(/\/$/, ''); },
  get databaseUrl() { return required('DATABASE_URL'); },
  get openaiModel() { return process.env.OPENAI_MODEL || 'gpt-5.4-mini'; },
  get deepgramKey() { return required('DEEPGRAM_API_KEY'); },
  get deepgramModel() { return process.env.DEEPGRAM_MODEL || 'nova-3'; },
  get freeAttempts() { return int('FREE_ATTEMPTS', 1); },
  get referralsPerAttempt() { return Math.max(1, int('REFERRALS_PER_ATTEMPT', 3)); },
};
