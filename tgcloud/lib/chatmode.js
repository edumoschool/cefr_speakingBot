// Chat voice mode: the whole mock in the bot chat, answered with voice messages.
// A fallback for devices where the Mini App can't use the microphone. Uses the
// same sessions, attempts, transcription and grading as the Mini App.
import { api, EndpointError } from 'sdk';
import { activeSession, finishSession, gradeSessionPart, nextStep, saveAudioAnswer, startSession, checkOpen } from './sessions.js';
import { getTest, buildSteps } from './exam.js';
import { getSetting, KEYS } from './settings.js';
import { openAppKeyboard, refreshMembership } from './users.js';
import { escapeHtml } from './util.js';
import { CHANNEL_URL } from './config.js';

const GRACE_SEC = 15; // a voice may run this much over the time limit
const MAX_VOICE_BYTES = 20 * 1024 * 1024; // getFileContent ceiling (Bot API getFile limit)

export async function startChatMock(userId) {
  if (!(await refreshMembership(userId))) {
    return api.sendMessage({
      chat_id: userId,
      text: '🔒 Join our channel first, then try again.',
      reply_markup: { inline_keyboard: [[{ text: '📢 Join the channel', url: CHANNEL_URL }], [{ text: "✅ I've joined", callback_data: 'check_join' }]] },
    });
  }
  let session = await activeSession(userId);
  if (session?.status === 'grading') return api.sendMessage({ chat_id: userId, text: '⏳ Your mock is being assessed. The result will arrive here shortly.' });
  if (!session) {
    try {
      session = await startSession(userId);
    } catch (e) {
      if (e instanceof EndpointError) return api.sendMessage({ chat_id: userId, text: e.description + (e.parameters?.code === 'NO_ATTEMPTS' ? ' (/referral)' : '') });
      throw e;
    }
    await api.sendMessage({
      chat_id: userId,
      parse_mode: 'HTML',
      text: `🎙 <b>Speaking mock in chat</b> — ${escapeHtml(getTest(session.test_id).title)}\n\n` +
        `For each question: prepare for the time shown, then <b>hold the mic button and send a voice message</b> within the time limit. ` +
        `The next question comes after each answer. Send /finish to end early.`,
    });
  }
  const step = await nextStep(session);
  if (!step) return finishInChat(userId, session);
  return sendQuestion(userId, session, step);
}

export async function sendQuestion(chatId, session, step) {
  const steps = buildSteps(getTest(session.test_id));
  const n = steps.findIndex((s) => s.key === step.key) + 1;
  const appUrl = await getSetting(KEYS.app_url);
  const img = (path) => (appUrl ? appUrl.replace(/\/$/, '') + path : null);

  // Pictures come from the hosted Mini App (public URLs Telegram can fetch).
  const pics = (step.images ?? []).map(img).filter(Boolean);
  try {
    if (pics.length === 2) await api.sendMediaGroup({ chat_id: chatId, media: pics.map((u) => ({ type: 'photo', media: u })) });
    else if (pics.length === 1) await api.sendPhoto({ chat_id: chatId, photo: pics[0] });
  } catch (e) {
    console.warn('pictures failed', e.description ?? String(e));
  }

  let body;
  if (step.part === '2') body = (step.bullets ?? []).map((b) => `• ${escapeHtml(b)}`).join('\n');
  else if (step.part === '3') {
    const t = step.table;
    body = `<b>${escapeHtml(t.statement)}</b>\n\n✅ <b>FOR</b>\n${t.for.map((x) => `• ${escapeHtml(x)}`).join('\n')}\n\n❌ <b>AGAINST</b>\n${t.against.map((x) => `• ${escapeHtml(x)}`).join('\n')}`;
  } else body = `<b>${escapeHtml(step.question)}</b>`;

  return api.sendMessage({
    chat_id: chatId,
    parse_mode: 'HTML',
    text: `📝 <b>Part ${step.part}</b> · question ${n}/${steps.length}\n\n${body}\n\n` +
      `⏱ Prepare ${step.prepSec} s, then send a 🎤 voice message (max ${fmt(step.speakSec)}).`,
  });
}

const fmt = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);

/** handlers/message → a voice message from the user. */
export async function onVoice(message) {
  const userId = message.from.id;
  const voice = message.voice;
  const session = await activeSession(userId);
  if (!session || session.status !== 'in_progress') {
    return api.sendMessage({ chat_id: userId, text: 'You have no mock in progress. Send /voice to start one in chat, or open the app.', reply_markup: await openAppKeyboard() });
  }
  try {
    checkOpen(session);
  } catch (e) {
    return api.sendMessage({ chat_id: userId, text: `${e.description} Send /finish.` });
  }
  const step = await nextStep(session);
  if (!step) return finishInChat(userId, session);

  if (voice.duration > step.speakSec + GRACE_SEC) {
    return api.sendMessage({ chat_id: userId, reply_to_message_id: message.message_id, text: `⏱ That's ${voice.duration} s — the limit for this question is ${fmt(step.speakSec)}. Please record a shorter answer.` });
  }
  if (voice.file_size && voice.file_size > MAX_VOICE_BYTES) {
    return api.sendMessage({ chat_id: userId, text: 'That recording is too large. Please send a shorter voice message.' });
  }

  await api.sendChatAction({ chat_id: userId, action: 'typing' });
  const bytes = await api.getFileContent(voice.file_id);
  const { inserted } = await saveAudioAnswer(session, step, bytes, voice.mime_type ?? 'audio/ogg');
  if (!inserted) {
    return api.sendMessage({ chat_id: userId, text: 'Please wait for the next question before sending another voice message.' });
  }

  const after = await nextStep(session);
  if (!after || after.part !== step.part) {
    // Part complete: grade it now so the final result is quick. Best effort — finish retries.
    try {
      await gradeSessionPart(session, step.part);
    } catch (e) {
      console.warn('part grading deferred', e.description ?? String(e));
    }
  }
  if (after) return sendQuestion(userId, session, after);
  return finishInChat(userId, session);
}

export async function finishInChat(userId, session) {
  const s = session ?? (await activeSession(userId));
  if (!s) return api.sendMessage({ chat_id: userId, text: 'You have no mock in progress.' });
  await api.sendMessage({ chat_id: userId, text: '⏳ Assessing your speaking… this takes up to a minute.' });
  try {
    const { session: done, fresh } = await finishSession(s.id, userId);
    if (fresh) await sendResultMessage(userId, done);
  } catch (e) {
    const msg = e instanceof EndpointError ? e.description : 'Assessment failed — please send /finish to try again.';
    await api.sendMessage({ chat_id: userId, text: msg });
  }
}

/** Headline result in chat with a button to the full feedback in the Mini App. */
export async function sendResultMessage(userId, session) {
  const r = typeof session.result === 'string' ? JSON.parse(session.result) : session.result;
  const parts = r.parts.map((p) => `Part ${p.part}: ${Math.round(p.points)}/75`).join(' · ');
  try {
    await api.sendMessage({
      chat_id: userId,
      parse_mode: 'HTML',
      text: `📊 <b>Your Multilevel speaking result</b>\n${escapeHtml(r.testTitle)}\n\n` +
        `Score: <b>${r.score}/75</b> · Level: <b>${escapeHtml(r.level)}</b>\n${parts}\n\n${escapeHtml(r.overall)}` +
        (r.priorities?.length ? `\n\n🎯 <b>Focus next</b>\n${r.priorities.map((x) => `• ${escapeHtml(x)}`).join('\n')}` : ''),
      reply_markup: await openAppKeyboard('📄 Full feedback', `#result=${session.id}`),
    });
  } catch (e) {
    console.warn('result message failed', e.description ?? String(e));
  }
}
