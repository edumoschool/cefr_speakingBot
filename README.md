# Multilevel Speaking Mock: Telegram Mini App

A full **Uzbekistan Multilevel (CEFR) speaking exam** simulator that runs inside Telegram, deployed serverless on Vercel.
Students record their answers under real exam timings. **Deepgram** transcribes each answer and measures fluency,
and **OpenAI** grades the mock as an examiner would: a score out of 75, a CEFR level (B1 / B2 / C1), and detailed feedback.

- Access is gated by membership of your Telegram channel.
- **1 free mock** for every new user.
- **Referral link**: every 3 referred users who join the channel give the referrer **+1 attempt**.
- 34 complete mocks taken from your PDFs, with 102 exam pictures and model answers for the 14 Mock Book tests.

## Architecture

```
Telegram ──webhook──▶ /api/telegram        bot: /start ref_<id>, join check, chat_member events, /referral, admin cmds
   │
   └─ Mini App (public/) ──initData (HMAC-verified)──▶
        POST /api/me              profile, channel gate, attempts, referral progress, history
        POST /api/mock/start      atomically spend 1 attempt + create session (or resume the open one)
        POST /api/mock/answer     one recording per question ─▶ Deepgram nova-3 ─▶ transcript + speech metrics ─▶ DB
        POST /api/mock/finish     all transcripts + metrics ─▶ OpenAI (strict JSON schema) ─▶ deterministic scoring ─▶ DB + chat message
        GET  /api/mock/result     saved result
        GET  /api/admin/setup     registers webhook, menu button, commands; checks bot is channel admin
Postgres (Neon): users · sessions · answers · attempt_ledger
```

Key design decisions:

| Concern | How it is handled |
|---|---|
| Serverless time limits | Each answer is transcribed **as soon as it is recorded** (in the background while the student moves on), so `finish` only makes one LLM call. Audio is never stored. |
| Scoring consistency | The LLM gives a **CEFR sub-level per criterion per part** (5 criteria × 4 parts). Code maps each one to points calibrated to the official bands (B1 38–50, B2 51–64, C1 65–75) and weights the parts (1.1: 20%, 1.2: 25%, 2: 25%, 3: 30%). See `lib/assess.ts`. |
| LLM over-generosity | A deterministic length guard caps fluency and task response when the student spoke far too little for the time allowed. |
| Pronunciation without audio-native LLM | Deepgram word confidence, words it could not make out, pauses, fillers and words per minute are passed to the grader as evidence. |
| Prompt injection via speech | Transcripts are sent as data, and the system prompt tells the model to ignore any instructions inside them. |
| Abuse and race conditions | Attempts are spent and the session is created **in one SQL statement**, and a partial unique index allows only one open mock per user. Referral counting is atomic, each referred user counts only once, a referrer can only be set for brand-new users, and self-referral is ignored. Every balance change is written to `attempt_ledger`. |
| Failures | If grading fails, the session goes back to `in_progress` and the student can retry without losing the attempt. Duplicate uploads are never transcribed twice. Unfinished mocks resume where they stopped. |
| Auth | Every API call verifies `Telegram.WebApp.initData` (HMAC-SHA256 with the bot token, 24 h max age). The webhook checks Telegram's secret-token header. |

## Deploy (about 15 minutes)

1. **Bot**: create one with @BotFather (`/newbot`). Then use `/newapp` to register a Mini App pointing at your Vercel URL. This is optional, because the menu button is configured automatically.
2. **Channel**: add the bot to your channel as an **administrator**. The bot needs this both to check membership and to receive join events.
3. **Database**: create a free Neon project (or add Neon from the Vercel Marketplace) and copy `DATABASE_URL`.
4. **Vercel**: import this repo and set the variables from `.env.example` (`BOT_TOKEN`, `BOT_USERNAME`, `CHANNEL_ID`, `CHANNEL_URL`, `WEBHOOK_SECRET`, `ADMIN_SECRET`, `ADMIN_IDS`, `APP_URL`, `DATABASE_URL`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`). Then deploy.
5. **Schema**: run `DATABASE_URL=... npm run db:migrate`. It is safe to run again.
6. **Wire up**: open `https://<your-app>.vercel.app/api/admin/setup?key=<ADMIN_SECRET>`. The response should show `"botIsChannelAdmin": true`.

The referral link format is `https://t.me/<bot>?start=ref_<userId>`. Opening the app with `t.me/<bot>/<app>?startapp=ref_<userId>` also works.

Admin commands in the bot (only for `ADMIN_IDS`): `/stats` and `/grant <userId> <n>`.

## Local development

```bash
npm install
cp .env.example .env              # fill in; FAKE_TELEGRAM=1 / FAKE_DEEPGRAM=1 let you run without them
npm run db:migrate
npm run dev                       # http://localhost:3000
npm run typecheck
TEST_DATABASE_URL=postgres://... npm test   # unit tests + attempts/referral integration tests
```

Question bank: `data/tests.json` (served without model answers until the mock is graded). Images are in `public/img/`, and topic vocabulary (EN/UZ/RU) is in `public/data/vocabulary.json`.
IDs: `ra01–ra10` and `rb01–rb10` are the two *Real Exam Questions* booklets, and `mb03–mb16` is the *Speaking Mock Book 2025*.

## Cost per mock (rough)

The exam has about 10 minutes of speaking time. Deepgram nova-3 pre-recorded costs roughly $0.04–0.05 for that, and one gpt-5.4-mini grading call costs about $0.01. That comes to **about $0.05–0.06 per mock**. Referrals pay for themselves if 3 channel members are worth more than that to you.

## Roadmap suggestions

- **Paid attempts**: sell attempts with Telegram Stars (`sendInvoice` with currency `XTR`). Credit them on `successful_payment` and record them in `attempt_ledger`.
- **Stronger anti-fraud**: count a referral only after the friend *completes* their free mock, or after they have stayed in the channel N days (re-check with a Vercel Cron job). Flag referrers with many accounts that joined and left.
- **Better pronunciation scoring**: send short clips to an audio-capable model (`gpt-4o-audio`) or a pronunciation API (Azure Pronunciation Assessment / Speechace) for phoneme-level scores.
- **Examiner voice**: pre-generate question audio with Deepgram Aura or OpenAI TTS and store it on Vercel Blob, instead of browser speech synthesis.
- **Async grading at scale**: move `finish` to a queue (Upstash QStash / Vercel Queues) and push the result through the bot message the app already sends.
- **Practice modes**: single-part drills (for example Part 3 only) for 1/4 attempt, daily streaks, and leaderboards in the channel to drive more joins.
- **Calibration**: have teachers score about 50 real recordings and tune `LEVEL_POINTS`/`PART_WEIGHTS` so the AI score matches human examiners.
