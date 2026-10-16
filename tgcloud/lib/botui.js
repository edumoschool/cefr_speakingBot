// Student-facing bot screens: welcome, main menu, invite, top list, language.
// Everything is a button; typed commands still work but nobody has to learn them.
import { api } from 'sdk';
import { APP_URL, CHANNEL_URL, REFERRALS_PER_ATTEMPT, SUPPORT_CONTACT } from './config.js';
import { myWeeklyRank, weeklyTop } from './leaderboard.js';
import { tFor, levelName } from './texts.js';
import { getUser } from './users.js';
import { screenMessage } from './screen.js';

async function appButton(text, path = '') {
  return APP_URL ? [{ text, web_app: { url: APP_URL + path } }] : null;
}

/** Main menu buttons (inline, under a message). */
export async function menuKeyboard(t) {
  const rows = [];
  const app = await appButton(t('btnOpenApp'));
  if (app) rows.push(app);
  rows.push([{ text: t('btnVoice'), callback_data: 'voice_mode' }]);
  rows.push([
    { text: t('btnInvite'), callback_data: 'menu:invite' },
    { text: t('btnTop'), callback_data: 'menu:top' },
  ]);
  rows.push([{ text: t('btnLang'), callback_data: 'menu:lang' }]);
  return { inline_keyboard: rows };
}

export async function sendWelcome(from, member) {
  const t = await tFor(from.id);
  const text = t('welcome', { name: from.first_name ? `, ${from.first_name}` : '', n: REFERRALS_PER_ATTEMPT });
  if (member) {
    return screenMessage({ chat_id: from.id, parse_mode: 'HTML', text, reply_markup: await menuKeyboard(t) });
  }
  return screenMessage({
    chat_id: from.id,
    parse_mode: 'HTML',
    text: `${text}\n\n${t('joinFirst')}`,
    reply_markup: {
      inline_keyboard: [[{ text: t('btnJoin'), url: CHANNEL_URL }], [{ text: t('btnJoined'), callback_data: 'check_join' }]],
    },
  });
}

/** `before`: an optional line shown above the menu ("Thanks for joining!"). */
export async function sendMenu(userId, before = '') {
  const t = await tFor(userId);
  return screenMessage({ chat_id: userId, text: before ? `${before}\n\n${t('menu')}` : t('menu'), reply_markup: await menuKeyboard(t) });
}

export async function referralLink(userId) {
  const me = await api.getMe();
  return `https://t.me/${me.username}?start=ref_${userId}`;
}

export async function sendInvite(userId) {
  const t = await tFor(userId);
  const u = await getUser(userId);
  const per = REFERRALS_PER_ATTEMPT;
  const link = await referralLink(userId);
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t('inviteShareText'))}`;
  return screenMessage({
    chat_id: userId,
    parse_mode: 'HTML',
    text: t('invite', { per, link, total: u.ref_qualified_count, progress: u.ref_qualified_count % per, attempts: u.attempts }),
    reply_markup: { inline_keyboard: [[{ text: t('btnShare'), url: share }]] },
  });
}

export function boardText(t, top) {
  if (!top.length) return t('boardEmpty');
  const medal = (i) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
  return `${t('boardTitle')}\n\n` + top.map((x, i) => `${medal(i)} ${x.name} — <b>${x.score}/75</b> (${levelName(t, x.level)})`).join('\n');
}

export async function sendTop(userId) {
  const t = await tFor(userId);
  const mine = await myWeeklyRank(userId);
  const app = await appButton(t('btnTakeTest'));
  return screenMessage({
    chat_id: userId,
    parse_mode: 'HTML',
    text: boardText(t, await weeklyTop(10)) + '\n\n' + (mine ? t('boardMine', { rank: mine.rank, score: mine.score }) : t('boardJoin')),
    reply_markup: app ? { inline_keyboard: [app] } : undefined,
  });
}

export async function sendLangPicker(userId) {
  const t = await tFor(userId);
  return screenMessage({
    chat_id: userId,
    text: t('chooseLang'),
    reply_markup: {
      inline_keyboard: [[
        { text: 'English', callback_data: 'lang:en' },
        { text: "O'zbekcha", callback_data: 'lang:uz' },
        { text: 'Русский', callback_data: 'lang:ru' },
      ]],
    },
  });
}

export async function sendBalance(userId) {
  const t = await tFor(userId);
  const u = await getUser(userId);
  return screenMessage({ chat_id: userId, text: t('balance', { n: u.attempts }), reply_markup: await menuKeyboard(t) });
}

export async function sendPaySupport(userId) {
  const t = await tFor(userId);
  return screenMessage({ chat_id: userId, text: t('paySupport', { contact: SUPPORT_CONTACT }) });
}

/** Command menu shown by Telegram's "/" button, in each language. */
export async function setCommandMenus() {
  const lists = {
    en: [['start', 'Main menu'], ['voice', 'Take the test here with voice messages'], ['invite', 'Invite friends, get free tests'], ['top', 'Top speakers this week'], ['lang', 'Language']],
    uz: [['start', 'Asosiy menyu'], ['voice', 'Testni shu yerda ovozli xabarlar bilan topshirish'], ['invite', "Do'stlarni taklif qilish"], ['top', 'Haftaning eng yaxshilari'], ['lang', 'Til']],
    ru: [['start', 'Главное меню'], ['voice', 'Пройти тест здесь голосовыми'], ['invite', 'Пригласить друзей'], ['top', 'Лучшие на этой неделе'], ['lang', 'Язык']],
  };
  const commands = (l) => lists[l].map(([command, description]) => ({ command, description }));
  await api.setMyCommands({ commands: commands('en') });
  await api.setMyCommands({ commands: commands('uz'), language_code: 'uz' });
  await api.setMyCommands({ commands: commands('ru'), language_code: 'ru' });
}
