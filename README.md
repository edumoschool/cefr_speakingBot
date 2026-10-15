# Multilevel Speaking Mock: Telegram Mini App on Telegram Serverless

A full **Uzbekistan Multilevel (CEFR) speaking exam** simulator inside Telegram. The bot backend runs on
**Telegram Serverless** (`tgcloud`), and the Mini App is **React + Ionic**. Students record answers under real exam timings.
**Deepgram** transcribes each answer and measures fluency, and **OpenAI** grades it as an examiner would. Students get a
score out of 75, a CEFR level (B1 / B2 / C1) and detailed feedback.

- Access requires membership of your Telegram channel.
- **1 free mock** for every new user.
- **Referral link** `t.me/<bot>?start=ref_<id>`: every 3 referred users who join the channel give the referrer **+1 attempt**.
- 34 complete mocks taken from your PDFs, with 102 exam pictures and model answers for the 14 Mock Book tests. There is also an EN/UZ/RU topic vocabulary list.

## Project layout

```
tgcloud/                     ← deployed to Telegram Serverless (runs in a V8 isolate; only `sdk` + these files)
  schema.js                  SQLite tables: users, sessions, answers, audio_chunks, part_grades, attempt_ledger, settings
  handlers/message.js        /start ref_<id>, /referral, /balance, admin: /setkey /setup /stats /grant
  handlers/callback_query.js "I've joined" button
  handlers/chat_member.js    channel join events → referral credit
  endpoints/                 called by the Mini App as POST /api/<name>
    me · start_mock · upload_answer · grade_part · finish_mock · get_result
  lib/                       config, exam structure, scoring, Deepgram, OpenAI, sessions, users, question bank
src/                         React + Ionic Mini App (Vite) → built to dist/ → hosted by tgcloud
public/img, public/data      exam pictures and vocabulary
dev/                         local stand-in for the platform `sdk` (node:sqlite) + dev server; not deployed
test/                        unit tests + tests that run the real handlers/endpoints locally
```

## How it works

```
Mini App ──Telegram.WebApp.Serverless.call──▶ endpoints (init data verified by the platform)
  record answer ─▶ upload_answer (base64 chunks) ─▶ Deepgram nova-3 ─▶ transcript + speech metrics ─▶ answers
  last answer of a part ─▶ grade_part (background) ─▶ OpenAI, one call per part ─▶ part_grades
  end ─▶ finish_mock ─▶ guardrails + scoring + short summary ─▶ result (also sent to the chat)
Bot updates ─▶ handlers/* (webhook managed by the platform)
```

Platform-specific design decisions:

| Constraint on Telegram Serverless | How it is handled |
|---|---|
| No npm packages at runtime, so the `openai` and `@deepgram/sdk` packages can't be used | Both are called through their REST APIs with the platform's `fetch`. These are the same requests the SDKs make. |
| Endpoints take JSON only | Recordings are sent as base64 in chunks of 300k characters or less. They are assembled on the last chunk, transcribed, then deleted. Re-sending the last chunk retries a failed transcription. |
| Request time limits | Each answer is transcribed as soon as it is recorded. Each part is graded in the background while the student keeps going. The result is ready a few seconds after the last answer (6.4 s in local testing). |
| No secret store | API keys live in the `settings` table. An admin sets them with `/setkey`, and the bot deletes that message immediately. |
| SQLite, no foreign keys, no transactions | Every balance change is a single atomic `UPDATE … RETURNING`. A partial unique index allows only one open mock per user, and a lost race refunds the attempt. Integrity is enforced in `lib/`, and every change to a balance is recorded in `attempt_ledger`. |

Scoring: for each part, the model gives a CEFR sub-level per criterion (fluency and coherence, vocabulary, grammar, pronunciation, task response).
`lib/scoring.js` maps those labels to points calibrated to the official bands (B1 38–50, B2 51–64, C1 65–75) and weights the parts
(1.1: 20%, 1.2: 25%, 2: 25%, 3: 30%). If a student says very little for the time allowed, a fixed length rule caps their fluency and task-response scores.
Pronunciation is judged from Deepgram evidence: how confident it was about each word, and which words it couldn't make out.

## Deploy

```bash
npm install
# 1. Edit tgcloud/lib/config.js: CHANNEL_ID, CHANNEL_URL, ADMIN_IDS (your Telegram user id)
npx tgcloud login          # link the project to your bot
npm run deploy             # vite build + tgcloud push (prints the Mini App URL, https://app<id>.tgcloud.ai/)
npx tgcloud migrate        # create the database tables (push never touches the DB)
```

Then, in Telegram:

1. Add the bot to your channel as an **administrator**. It needs this to check membership and to receive join events.
2. Message your bot as an admin:
   - `/setkey openai sk-...`
   - `/setkey deepgram <key>`
   - `/setup https://app<id>.tgcloud.ai/` sets the Mini App URL, the menu button and the command list, and checks the channel admin rights.
3. Optionally, set the Mini App in @BotFather (`/newapp` or Main Mini App) with the same URL, so that `t.me/<bot>/<app>?startapp=ref_<id>` also works.

Admin commands: `/stats` and `/grant <userId> <n>`. Schema changes: edit `tgcloud/schema.js`, then run `npm run deploy` and `npx tgcloud migrate`.

## Local development

```bash
npm test                                   # unit tests + real handlers/endpoints against the local sdk stand-in
npm run build && OPENAI_API_KEY=sk-... FAKE_DEEPGRAM=1 npm run dev:api
# open http://localhost:8787/?user=1001&name=Ali   (each ?user= is a separate local user)
npm run dev                                # Vite hot reload on :5173, proxies /api to dev:api
```

`dev/sdk/` mimics the parts of the platform `sdk` this project uses: SQLite through `node:sqlite`, a recorded Bot API, and `fetch`.
It is a local testing aid, not the platform. On Telegram itself the endpoints use the platform's verified `ctx.initData`.

## Cost per mock (rough)

A mock has about 10 minutes of speech. Deepgram nova-3 costs roughly $0.04 for that, and the 4 + 1 short gpt-5.4-mini calls cost about $0.01. That comes to **about $0.05 per mock**.

## Roadmap ideas

- **Paid attempts** with Telegram Stars (`sendInvoice`, currency `XTR`), credited from the `pre_checkout_query` and `message` handlers, and recorded in `attempt_ledger`.
- **Stronger referral anti-fraud**: credit a referral only after the friend finishes their free mock, or re-check later that they're still in the channel.
- **Examiner voice**: pre-generated question audio (Deepgram Aura / OpenAI TTS) served from `dist/`, instead of browser speech synthesis.
- **Part drills** (for example Part 3 only) for 1/4 attempt, and a weekly leaderboard posted to the channel.
- **Calibration**: have teachers score about 50 real recordings and tune `LEVEL_POINTS` / `PART_WEIGHTS` in `tgcloud/lib/scoring.js`.
