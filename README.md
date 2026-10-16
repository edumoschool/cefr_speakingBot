# Multilevel Speaking Mock: Telegram Mini App on Telegram Serverless

A full **Uzbekistan Multilevel (CEFR) speaking exam** simulator inside Telegram. The bot backend runs on
**Telegram Serverless** (`tgcloud`), and the Mini App is **React + Ionic**. Students record answers under real exam timings.
**Deepgram** transcribes each answer and measures fluency, and **OpenAI** grades it as an examiner would. Students get a
score out of 75, a CEFR level (B1 / B2 / C1) and detailed feedback.

- Access requires membership of your Telegram channel.
- **1 free mock** for every new user.
- **Referral link** `t.me/<bot>?start=ref_<id>`: every 3 referred users who join the channel give the referrer **+1 attempt**.
- **Two ways to answer**: record in the Mini App, or take the same mock **in the bot chat with voice messages** (`/voice`).
  The chat option is a fallback for phones where the Mini App can't use the microphone.
- **Optional paid attempts with Telegram Stars**: packs set in `tgcloud/lib/config.js`, **off until an admin sends `/payments on`**.
- **Examiner voice**: every question is read aloud by a pre-recorded examiner (229 clips, OpenAI TTS), and preparation time starts when the examiner stops.
- **Feedback in English, O'zbekcha or Русский** (Mini App or `/lang`). Corrections and better word choices stay in English.
- **Progress tracking**: a score trend across mocks with the B1/B2/C1 thresholds, and the change in each criterion since the last mock.
- **Share my result**: posts the score together with the student's referral link.
- **Part drills**: practise one part (1.1, 1.2, 2 or 3) for free, `DRILLS_PER_DAY` per day (3 by default). Drills don't use mock attempts and cost about a quarter of a mock to grade.
- **Weekly leaderboard**: each student's best full-mock score over the last 7 days (first names only), with their own rank. It's computed when someone looks at it, so no scheduler is needed. `/top` shows it in chat, and admin `/leaderboard` posts it to the channel.
- **Examiner voice in chat mode**: each question in the bot chat comes with the same recorded clip.
- 34 complete mocks taken from your PDFs, with 102 exam pictures and model answers for the 14 Mock Book tests.

## Owner's guide (no coding needed)

**What students see**
- The app opens in **O'zbekcha, Русский or English**, picked automatically from their Telegram language. They can change it in Settings. The examiner's feedback comes in the same language.
- First visit: a 3-screen welcome, then four tabs: **Practice** (full test, or one part for free), **Progress** (score chart, past results, top speakers), **Friends** (invite link, buying tests) and **Settings** (language, how the test works, help).
- Before a test: a microphone check (record 3 seconds and hear it back). Before each part: a short explanation of what happens and how much time there is.
- Results: the level in plain words, the 3 most important things to improve, what went well, then details on tap.
- In the bot chat everything is buttons: open the app, take the test with voice messages, invite friends, top speakers, language. Typing anything just shows the menu.

**What you do (admin)** — send **/admin** to the bot. You get one message with buttons:
- ✅/❌ shows which setup steps are done (OpenAI key, Deepgram key, Mini App link) and what to send for the missing ones.
- 📊 Statistics · 🏆 Post top speakers to the channel · ⭐ Turn payments on/off · 🎁 How to give a student free tests.

Setup messages (sent once): `/setkey openai …`, `/setkey deepgram …` (deleted automatically), and `/setup <Mini App link>`.
To give someone free tests: `/grant THEIR_ID NUMBER`. Students can see their ID in the app under Settings → Need help?

## Project layout

```
tgcloud/                     ← deployed to Telegram Serverless (runs in a V8 isolate; only `sdk` + these files)
  schema.js                  SQLite tables: users, sessions, answers, audio_chunks, part_grades, attempt_ledger, settings
  handlers/message.js        /start ref_<id>, /referral, /balance, admin: /setkey /setup /stats /grant
  handlers/callback_query.js "I've joined" button
  handlers/chat_member.js    channel join events → referral credit
  handlers/pre_checkout_query.js  Stars payment validation
  endpoints/                 called by the Mini App as POST /api/<name>
    me · start_mock · start_drill · upload_answer · grade_part · finish_mock · get_result · create_invoice · set_prefs
  lib/                       config, exam structure, scoring, Deepgram, OpenAI, sessions, users, question bank
src/                         React + Ionic Mini App (Vite) → built to dist/ → hosted by tgcloud
public/img, public/audio     exam pictures and examiner voice clips (scripts/generate-audio.mjs)
dev/                         local stand-in for the platform `sdk` (node:sqlite) + dev server; not deployed
test/                        unit tests + tests that run the real handlers/endpoints locally
```

## How it works

```
Mini App ──Telegram.WebApp.Serverless.call──▶ endpoints (init data verified by the platform)
  record answer ─▶ upload_answer (base64 chunks) ─▶ Deepgram nova-3 ─▶ transcript + speech metrics ─▶ answers
  last answer of a part ─▶ grade_part (background) ─▶ OpenAI, one call per part ─▶ part_grades
  end ─▶ finish_mock ─▶ guardrails + scoring + short summary ─▶ result (also sent to the chat)
Chat mode: /voice ─▶ question in chat (photos via the hosted app URL) ─▶ voice message ─▶ api.getFileContent(file_id)
  ─▶ same transcription, answers, per-part grading and attempt as the Mini App ─▶ next question … ─▶ result in chat
Bot updates ─▶ handlers/* (webhook managed by the platform)
```

Platform-specific design decisions:

| Constraint on Telegram Serverless | How it is handled |
|---|---|
| No npm packages at runtime, so the `openai` and `@deepgram/sdk` packages can't be used | Both are called through their REST APIs with the platform's `fetch`. These are the same requests the SDKs make. |
| Endpoints take JSON only | Recordings are sent as base64 in chunks of 300k characters or less. They are assembled on the last chunk, transcribed, then deleted. Re-sending the last chunk retries a failed transcription. |
| Telegram file helpers | Chat voice messages are downloaded with `api.getFileContent(file_id)`, so the code never handles the bot token or a download URL. Telegram's 20 MB getFile cap is far above a 2-minute voice note. Voices longer than the time limit plus 15 s are rejected before transcription. |
| `fetch` responses are read as text, max 30 MB | Deepgram and OpenAI return JSON (a few KB to tens of KB), read with `res.json()`. Audio bytes only go out, as a `Uint8Array` request body. |
| Stars payments | `pre_checkout_query` checks the pack, price, currency `XTR` and buyer. `successful_payment` credits attempts **once per `telegram_payment_charge_id`** (the `payments` table), so a redelivered update can't double-credit. The attempt count is carried in the invoice payload, so later price edits don't change paid invoices. `/refund <charge_id>` calls `refundStarPayment` and removes the purchased attempts. |
| Abandoned mocks | After 3 hours, an unfinished mock with no answers is closed and its attempt refunded. One with answers goes straight to grading. Partial uploads are deleted. |
| Request time limits | Each answer is transcribed as soon as it is recorded. Each part is graded in the background while the student keeps going. The result is ready a few seconds after the last answer (6.4 s in local testing). |
| No secret store | API keys live in the `settings` table. An admin sets them with `/setkey`, and the bot deletes that message immediately. |
| Raw SQL: `db.run` is for writes, `db.all`/`db.get` for reads | Every `INSERT/UPDATE … RETURNING` goes through `returning()` (`lib/db.js`), which reads `db.run(...).rows`. The local stand-in rejects writes passed to `db.all`, so tests catch mistakes. |
| SQLite, no foreign keys, no transactions | Every balance change is a single atomic `UPDATE … RETURNING`. A partial unique index allows only one open mock per user, and a lost race refunds the attempt. Integrity is enforced in `lib/`, and every change to a balance is recorded in `attempt_ledger`. |

Scoring: for each part, the model gives a CEFR sub-level per criterion (fluency and coherence, vocabulary, grammar, pronunciation, task response).
`lib/scoring.js` maps those labels to points calibrated to the official bands (B1 38–50, B2 51–64, C1 65–75) and weights the parts
(1.1: 20%, 1.2: 25%, 2: 25%, 3: 30%). If a student says very little for the time allowed, a fixed length rule caps their fluency and task-response scores.
Pronunciation is judged from Deepgram evidence: how confident it was about each word, and which words it couldn't make out.

## Deploy

First, in **@BotFather → your bot → Serverless**, switch Serverless on. Then open **CLI Access → Access token** and copy the
token (`app<id>:<secret>`). It is not the bot's API token.

```bash
npm install
# 1. Edit tgcloud/lib/config.js: CHANNEL_ID, CHANNEL_URL, ADMIN_IDS (your Telegram user id)
npx tgcloud login          # paste the CLI access token (in CI: set TGCLOUD_TOKEN instead)
npm run deploy             # vite build + tgcloud push (prints the Mini App URL, https://app<id>.tgcloud.ai/)
npx tgcloud migrate        # create the database tables (push never touches the DB)
npx tgcloud webhook        # should say "in sync": message, callback_query, chat_member
```

Smoke-test the code on the platform without deploying:

```bash
npx tgcloud run handlers/message '{ chat: { id: 1, type: "private" }, from: { id: 1, first_name: "Ann" }, text: "/start" }'
npx tgcloud run endpoints/me '{}' --ctx '{ initData: { user: { id: 1, first_name: "Ann" } } }'
```

Then, in Telegram:

1. Add the bot to your channel as an **administrator**. It needs this to check membership and to receive join events.
2. Message your bot as an admin:
   - `/setkey openai sk-...`
   - `/setkey deepgram <key>`
   - `/setup https://app<id>.tgcloud.ai/` sets the Mini App URL, the menu button and the command list, and checks the channel admin rights.
3. Optionally, set the Mini App in @BotFather (`/newapp` or Main Mini App) with the same URL, so that `t.me/<bot>/<app>?startapp=ref_<id>` also works.

User commands: `/start`, `/voice` (mock in chat), `/finish`, `/referral`, `/balance`, `/top`, `/lang`, `/buy`, `/paysupport`.
Admin commands: `/stats`, `/grant <userId> <n>`, `/leaderboard` (post to the channel; the bot needs "Post messages" rights), `/payments on|off`, `/refund <charge_id>`, `/setkey`, `/setup`.
Before turning payments on, set `SUPPORT_CONTACT` and review `STAR_PACKS` in `tgcloud/lib/config.js`. Schema changes: edit `tgcloud/schema.js`, then run `npm run deploy` and `npx tgcloud migrate`.

## Local development

```bash
npm test                                   # unit tests + real handlers/endpoints against the local sdk stand-in
npm run build && OPENAI_API_KEY=sk-... FAKE_DEEPGRAM=1 npm run dev:api
# open http://localhost:8787/?user=1001&name=Ali   (each ?user= is a separate local user)
npm run dev                                # Vite hot reload on :5173, proxies /api to dev:api
```

`dev/sdk/` mimics the parts of the platform `sdk` this project uses: SQLite through `node:sqlite`, a recorded Bot API, and `fetch`.
It is a local testing aid, not the platform. On Telegram itself the endpoints use the platform's verified `ctx.initData`.

## Examiner voice

`public/audio/` holds one MP3 per distinct question text (32 kbps mono, about 5 MB in total), and
`tgcloud/lib/audio-manifest.js` maps each text to its clip. After adding or editing questions, regenerate them.
Existing clips are reused, so only new questions cost anything (needs ffmpeg):

```bash
OPENAI_API_KEY=sk-... node scripts/generate-audio.mjs   # TTS_VOICE=sage by default
```

A test fails if any question is missing its clip.

## Cost per mock (rough)

A mock has about 10 minutes of speech. Deepgram nova-3 costs roughly $0.04 for that, and the 4 + 1 short gpt-5.4-mini calls cost about $0.01. That comes to **about $0.05 per mock**.

## Roadmap ideas

- **Stronger referral anti-fraud**: credit a referral only after the friend finishes their free mock, or re-check later that they're still in the channel.
- **Calibration**: have teachers score about 50 real recordings and tune `LEVEL_POINTS` / `PART_WEIGHTS` in `tgcloud/lib/scoring.js`.
