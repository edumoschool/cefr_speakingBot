// Test settings (loaded before any test via --import). Real values come from .env only on deploy.
globalThis.__TGCLOUD_ENV__ = {
  OPENAI_API_KEY: 'sk-test',
  OPENAI_MODEL: 'gpt-5.4-mini',
  TRANSCRIBER: 'deepgram',
  DEEPGRAM_API_KEY: 'dg-test',
  DEEPGRAM_MODEL: 'nova-3',
  ELEVENLABS_API_KEY: 'el-test',
  ELEVENLABS_MODEL: 'scribe_v2',
  CHANNEL_ID: '@your_channel',
  CHANNEL_URL: 'https://t.me/your_channel',
  ADMIN_IDS: [123456789],
  SUPPORT_CONTACT: '@support',
  APP_URL: 'https://app1.tgcloud.ai/',
};
