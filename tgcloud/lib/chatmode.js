// Chat voice mode: the whole test in the bot chat, answered with voice messages.
// A fallback for phones where the Mini App can't use the microphone. Uses the
// same sessions, attempts, transcription and grading as the Mini App.
import { api, EndpointError } from 'sdk';
import { activeSession, checkOpen, finishSession, gradeSessionPart, isExpired, nextStep, saveAudioAnswer, settleExpired, startSession } from './sessions.js';
import { getTest, publicTest, sessionSteps } from './exam.js';
import { getSetting, KEYS } from './settings.js';
import { openAppKeyboard, refreshMembership } from './users.js';
import { escapeHtml } from './util.js';
import { CHANNEL_URL } from './config.js';
import { duration, langOf, levelName, PART_NAMES, tr } from './texts.js';

const GRACE_SEC = 15; // a voice may run this much over the time limit
const MAX_VOICE_BYTES = 20 * 1024 * 1024; // getFileContent ceiling (Bot API getFile limit)

/** A session error in the student's language (codes from lib/sessions.js). */
const errText = (t, e) => {
  const code = e?.parameters?.code;
  const s = code ? t(code) : null;
  return s && s !== code ? s : e.description;
};

export async function startChatMock(userId) {
  const lang = await langOf(userId);
  const t = tr(lang);
  if (!(await refreshMembership(userId))) {
    return api.sendMessage({
      chat_id: userId,
      text: t('joinFirst'),
      reply_markup: { inline_keyboard: [[{ text: t('btnJoin'), url: CHANNEL_URL }], [{ text: t('btnJoined'), callback_data: 'check_join' }]] },
    });
  }
  let session = await settleExpired(await activeSession(userId));
  if (session && isExpired(session)) return finishInChat(userId, session);
  if (session?.status === 'grading') return api.sendMessage({ chat_id: userId, text: t('stillChecking') });
  if (!session) {
    try {
      session = await startSession(userId);
    } catch (e) {
      if (e instanceof EndpointError) {
        const invite = e.parameters?.code === 'NO_ATTEMPTS' ? { inline_keyboard: [[{ text: t('btnInvite'), callback_data: 'menu:invite' }]] } : undefined;
        return api.sendMessage({ chat_id: userId, text: errText(t, e), reply_markup: invite });
      }
      throw e;
    }
    await api.sendMessage({ chat_id: userId, parse_mode: 'HTML', text: t('chatIntro') });
  }
  const step = await nextStep(session);
  if (!step) return finishInChat(userId, session);
  return sendQuestion(userId, session, step, lang);
}

export async function sendQuestion(chatId, session, step, lang) {
  lang ??= await langOf(chatId);
  const t = tr(lang);
  const steps = sessionSteps(session);
  const n = steps.findIndex((s) => s.key === step.key) + 1;
  const appUrl = await getSetting(KEYS.app_url);
  const abs = (path) => (appUrl ? appUrl.replace(/\/$/, '') + path : null);

  // Pictures come from the hosted Mini App (public URLs Telegram can fetch).
  const pics = (step.images ?? []).map(abs).filter(Boolean);
  try {
    if (pics.length === 2) await api.sendMediaGroup({ chat_id: chatId, media: pics.map((u) => ({ type: 'photo', media: u })) });
    else if (pics.length === 1) await api.sendPhoto({ chat_id: chatId, photo: pics[0] });
  } catch (e) {
    console.warn('pictures failed', e.description ?? String(e));
  }

  // The question itself stays in English, as in the exam.
  let body;
  if (step.part === '2') body = (step.bullets ?? []).map((b) => `• ${escapeHtml(b)}`).join('\n');
  else if (step.part === '3') {
    const tb = step.table;
    body = `<b>${escapeHtml(tb.statement)}</b>\n\n✅ <b>${t('forLabel')}</b>\n${tb.for.map((x) => `• ${escapeHtml(x)}`).join('\n')}\n\n❌ <b>${t('againstLabel')}</b>\n${tb.against.map((x) => `• ${escapeHtml(x)}`).join('\n')}`;
  } else body = `<b>${escapeHtml(step.question)}</b>`;

  const header = t('partHeader', { p: step.part, name: PART_NAMES[lang]?.[step.part] ?? PART_NAMES.en[step.part], n, total: steps.length });
  await api.sendMessage({
    chat_id: chatId,
    parse_mode: 'HTML',
    text: `${header}\n\n${body}\n\n${t('prepThenSpeak', { prep: duration(t, step.prepSec), speak: duration(t, step.speakSec) })}`,
  });
  // The examiner's recorded voice, hosted with the Mini App (same clip as in the app).
  const clip = publicTest(getTest(session.test_id)).steps.find((s) => s.key === step.key)?.audio;
  if (clip && appUrl) {
    try {
      await api.sendAudio({ chat_id: chatId, audio: abs(clip), title: `${PART_NAMES[lang]?.[step.part] ?? PART_NAMES.en[step.part]} · ${n}/${steps.length}`, performer: t('examiner'), disable_notification: true });
    } catch (e) {
      console.warn('examiner clip failed', e.description ?? String(e));
    }
  }
}

/** handlers/message → a voice message from the student. */
export async function onVoice(message) {
  const userId = message.from.id;
  const lang = await langOf(userId);
  const t = tr(lang);
  const voice = message.voice;
  const session = await activeSession(userId);
  if (!session || session.status !== 'in_progress') {
    const app = await openAppKeyboard(t('btnOpenApp'));
    return api.sendMessage({
      chat_id: userId,
      text: t('noTest'),
      reply_markup: { inline_keyboard: [[{ text: t('btnVoice'), callback_data: 'voice_mode' }], ...(app?.inline_keyboard ?? [])] },
    });
  }
  try {
    checkOpen(session);
  } catch {
    return api.sendMessage({ chat_id: userId, text: t('expired') });
  }
  const step = await nextStep(session);
  if (!step) return finishInChat(userId, session);

  if (voice.duration > step.speakSec + GRACE_SEC) {
    return api.sendMessage({ chat_id: userId, reply_to_message_id: message.message_id, text: t('tooLong', { d: voice.duration, limit: duration(t, step.speakSec) }) });
  }
  if (voice.file_size && voice.file_size > MAX_VOICE_BYTES) {
    return api.sendMessage({ chat_id: userId, text: t('tooLarge') });
  }

  await api.sendChatAction({ chat_id: userId, action: 'typing' });
  const bytes = await api.getFileContent(voice.file_id);
  const { inserted } = await saveAudioAnswer(session, step, bytes, voice.mime_type ?? 'audio/ogg');
  if (!inserted) return api.sendMessage({ chat_id: userId, text: t('waitNext') });

  const after = await nextStep(session);
  if (!after || after.part !== step.part) {
    // Part complete: grade it now so the final result is quick. Best effort — finish retries.
    try {
      await gradeSessionPart(session, step.part);
    } catch (e) {
      console.warn('part grading deferred', e.description ?? String(e));
    }
  }
  if (after) return sendQuestion(userId, session, after, lang);
  return finishInChat(userId, session);
}

export async function finishInChat(userId, session) {
  const t = tr(await langOf(userId));
  const s = session ?? (await activeSession(userId));
  if (!s) return api.sendMessage({ chat_id: userId, text: t('noTest'), reply_markup: { inline_keyboard: [[{ text: t('btnVoice'), callback_data: 'voice_mode' }]] } });
  await api.sendMessage({ chat_id: userId, text: t('checking') });
  try {
    const { session: done, fresh } = await finishSession(s.id, userId);
    if (fresh) await sendResultMessage(userId, done);
  } catch (e) {
    await api.sendMessage({ chat_id: userId, text: e instanceof EndpointError ? errText(t, e) : t('checkFailed') });
  }
}

/** Headline result in chat with a button to the full feedback in the Mini App. */
export async function sendResultMessage(userId, session) {
  const lang = await langOf(userId);
  const t = tr(lang);
  const r = typeof session.result === 'string' ? JSON.parse(session.result) : session.result;
  const drill = r.kind === 'drill';
  const title = drill ? t('practiceTitle', { p: escapeHtml(r.drillPart) }) : t('resultTitle');
  const parts = drill ? '' : '\n' + r.parts.map((p) => `${p.part}: ${Math.round(p.points)}/75`).join(' · ');
  const focus = r.priorities?.length ? `\n\n${t('focus')}\n${r.priorities.slice(0, 3).map((x) => `• ${escapeHtml(x)}`).join('\n')}` : '';
  try {
    await api.sendMessage({
      chat_id: userId,
      parse_mode: 'HTML',
      text: `${title}\n\n${t('score', { score: r.score, level: escapeHtml(levelName(t, r.level)) })}${parts}\n\n${escapeHtml(r.overall ?? '')}${focus}`,
      reply_markup: await openAppKeyboard(t('btnFullFeedback'), `#result=${session.id}`),
    });
  } catch (e) {
    console.warn('result message failed', e.description ?? String(e));
  }
}
