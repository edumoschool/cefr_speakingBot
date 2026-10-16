// Keeps the bot chat short. Menus, hints and the current voice-mode question are
// a "screen": showing a new screen deletes the previous one, so the chat holds one
// screen at a time. Results, receipts and reward notices are sent normally and stay.
import { api, db } from 'sdk';
import { sql } from 'sdk/db';

async function screenIds(chatId) {
  const row = await db.get(sql`SELECT screen_msgs FROM users WHERE id = ${chatId}`);
  try {
    return JSON.parse(row?.screen_msgs ?? '[]');
  } catch {
    return [];
  }
}

const saveIds = (chatId, ids) => db.run(sql`UPDATE users SET screen_msgs = ${JSON.stringify(ids.slice(-50))} WHERE id = ${chatId}`);

const messageIds = (sent) => [sent].flat().map((m) => m?.message_id).filter(Number.isInteger);

/** Deletes messages, best effort (Telegram skips ones that are gone or older than 48 h). */
export async function removeMessages(chatId, ids) {
  if (!ids.length) return;
  try {
    await api.deleteMessages({ chat_id: chatId, message_ids: ids });
  } catch (e) {
    console.warn('delete failed', e.description ?? String(e));
  }
}

/**
 * Shows a new screen: `send` sends its message(s) and returns what the Bot API
 * returned (a message, or a list). The old screen is removed after the new one
 * is up, so the chat never looks empty.
 */
export async function showScreen(chatId, send) {
  const old = await screenIds(chatId);
  const sent = await send();
  await saveIds(chatId, messageIds(sent));
  await removeMessages(chatId, old);
  return [sent].flat()[0];
}

/** Shorthand: a one-message screen. */
export const screenMessage = (params) => showScreen(params.chat_id, () => api.sendMessage(params));

/** Adds messages to the current screen (a hint under the question, the student's own voice answer). */
export async function addToScreen(chatId, sentOrIds) {
  const ids = typeof sentOrIds === 'number' ? [sentOrIds] : messageIds(sentOrIds);
  if (ids.length) await saveIds(chatId, [...(await screenIds(chatId)), ...ids]);
  return sentOrIds;
}

/** A hint that sits under the current screen and goes away with it. */
export const screenNote = async (params) => addToScreen(params.chat_id, await api.sendMessage(params));

/** Removes the current screen, e.g. once the result has been sent. */
export async function clearScreen(chatId) {
  const old = await screenIds(chatId);
  await saveIds(chatId, []);
  await removeMessages(chatId, old);
}
