// Student-facing bot messages in English, Uzbek and Russian (same words as the Mini App).
// Pure module. Admin messages stay in English and live in handlers.
import { db } from 'sdk';
import { sql } from 'sdk/db';

const en = {
  welcome: '👋 Hi{name}! Practise the <b>Multilevel speaking test</b> with real exam questions and get your score out of 75, your level and clear tips — in about a minute.\n\n🎁 Your first test is <b>free</b>.\n👥 Invite {n} friends to our channel → <b>+1 free test</b>.',
  joinFirst: '🔒 To start, please join our channel, then tap “I’ve joined”.',
  btnOpenApp: '🎤 Open the app',
  btnVoice: '🎙 Take the test here with voice messages',
  btnInvite: '🎁 Invite friends',
  btnTop: '🏆 Top speakers',
  btnLang: '🌐 Language',
  btnJoin: '📢 Join the channel',
  btnJoined: '✅ I’ve joined',
  btnShare: '📤 Share my link',
  btnTakeTest: '🎤 Take a test',
  btnFullFeedback: '📄 See full feedback',
  btnFreeTest: '🎁 Take a free test',
  notInChannel: 'We can’t see you in the channel yet. Join it and tap again.',
  joinedThanks: '🎉 Thanks for joining! Your first test is free.',
  menu: 'What would you like to do?',
  chooseLang: '🌐 Choose your language:',
  langSaved: '✅ Language: English',
  invite: '🎁 <b>Invite friends, get free tests</b>\n\nFor every {per} friends who join our channel with your link, you get 1 free test.\n\nYour link:\n{link}\n\nFriends joined: <b>{total}</b> · towards next test: <b>{progress}/{per}</b>\nTests left: <b>{attempts}</b>',
  inviteShareText: '🎤 Practise the Multilevel speaking test and get your score in a minute. Your first test is free!',
  balance: 'You have {n} test(s) left.',
  refJoined: '👥 A friend joined with your link ({p}/{per}). {left} more and you get a free test!',
  refReward: '🎉 {count} friends have joined with your link — you got 1 more free test!\nTests left: {attempts}.',
  granted: '🎁 You received {n} free test(s)!',
  // leaderboard
  boardTitle: '🏆 <b>Top speakers this week</b>',
  boardEmpty: '🏆 Nobody has finished a test this week yet — be the first!',
  boardMine: 'You: #{rank} with {score}/75',
  boardJoin: 'Finish a full test this week to join the list.',
  // chat mode
  chatIntro: '🎙 <b>Speaking test in chat</b>\n\nFor each question: get ready, then <b>hold the 🎤 button and send a voice message</b>. The next question comes after your answer. Send /finish to stop early.',
  partHeader: '📝 <b>Part {p} · {name}</b> · question {n} of {total}',
  prepThenSpeak: '⏱ Get ready ({prep}), then send a 🎤 voice message (up to {speak}).',
  forLabel: 'FOR',
  againstLabel: 'AGAINST',
  examiner: 'Examiner',
  tooLong: '⏱ Your message is {d} seconds long, but the limit is {limit}. Please record a shorter answer.',
  tooLarge: 'That recording is too large. Please send a shorter voice message.',
  waitNext: 'Please wait for the next question before sending another voice message.',
  noTest: 'You don’t have a test in progress. Tap below to start one.',
  checking: '⏳ Checking your speaking… this usually takes less than a minute.',
  stillChecking: '⏳ Your test is being checked. The result will come here shortly.',
  checkFailed: 'Sorry, checking failed. Send /finish to try again.',
  expired: 'This test is too old to continue. Send /finish to get results for the answers you recorded.',
  resultTitle: '📊 <b>Your speaking result</b>',
  practiceTitle: '📊 <b>Practice result — Part {p}</b>',
  score: 'Score: <b>{score}/75</b> · Level: <b>{level}</b>',
  focus: '🎯 <b>Improve first</b>',
  belowB1: 'Below B1',
  sec: '{n} sec',
  min: '{n} min',
  // payments
  buyTitle: '⭐ Get more tests with Telegram Stars:',
  buyOff: 'Purchases are not available right now. Invite friends to get free tests.',
  paid: '⭐ Thank you! {n} test(s) added — you now have {total}.',
  paySupport: '💬 Payment help: {contact}\nPlease send the payment code from your receipt. Unused purchases can be refunded.',
  // errors from sessions
  NO_ATTEMPTS: 'You have no tests left. Invite friends to get a free one.',
  ACTIVE_SESSION: 'You already have an unfinished test. Continue it first.',
  NO_DRILLS: 'You’ve used today’s free practice. Come back tomorrow!',
  NO_ANSWERS: 'No answers were recorded yet.',
  BUSY: 'Still checking… please wait a moment.',
};

const uz = {
  welcome: "👋 Salom{name}! <b>Multilevel speaking testi</b>ni haqiqiy imtihon savollari bilan mashq qiling va taxminan bir daqiqada 75 balldan bahoingiz, darajangiz hamda aniq maslahatlarni oling.\n\n🎁 Birinchi test <b>bepul</b>.\n👥 Kanalimizga {n} ta do'stingizni taklif qiling → <b>+1 bepul test</b>.",
  joinFirst: "🔒 Boshlash uchun kanalimizga qo'shiling, so'ng «Qo'shildim» tugmasini bosing.",
  btnOpenApp: '🎤 Ilovani ochish',
  btnVoice: '🎙 Testni shu yerda ovozli xabarlar bilan topshirish',
  btnInvite: "🎁 Do'stlarni taklif qilish",
  btnTop: '🏆 Eng yaxshilar',
  btnLang: '🌐 Til',
  btnJoin: "📢 Kanalga qo'shilish",
  btnJoined: "✅ Qo'shildim",
  btnShare: '📤 Havolani ulashish',
  btnTakeTest: '🎤 Test topshirish',
  btnFullFeedback: "📄 To'liq fikr-mulohaza",
  btnFreeTest: '🎁 Bepul test topshirish',
  notInChannel: "Sizni hali kanalda ko'rmayapmiz. Qo'shiling va qayta bosing.",
  joinedThanks: "🎉 Qo'shilganingiz uchun rahmat! Birinchi test bepul.",
  menu: 'Nima qilmoqchisiz?',
  chooseLang: '🌐 Tilni tanlang:',
  langSaved: "✅ Til: O'zbekcha",
  invite: "🎁 <b>Do'stlarni taklif qiling — bepul test oling</b>\n\nHavolangiz orqali kanalimizga qo'shilgan har {per} ta do'stingiz uchun 1 ta bepul test olasiz.\n\nHavolangiz:\n{link}\n\nQo'shilgan do'stlar: <b>{total}</b> · keyingi testgacha: <b>{progress}/{per}</b>\nQolgan testlar: <b>{attempts}</b>",
  inviteShareText: '🎤 Multilevel speaking testini mashq qiling va natijangizni bir daqiqada oling. Birinchi test bepul!',
  balance: 'Sizda {n} ta test qoldi.',
  refJoined: "👥 Havolangiz orqali do'stingiz qo'shildi ({p}/{per}). Yana {left} ta — va bepul test sizniki!",
  refReward: "🎉 Havolangiz orqali {count} ta do'stingiz qo'shildi — yana 1 ta bepul test oldingiz!\nQolgan testlar: {attempts}.",
  granted: '🎁 Sizga {n} ta bepul test berildi!',
  boardTitle: '🏆 <b>Haftaning eng yaxshilari</b>',
  boardEmpty: '🏆 Shu hafta hali hech kim test tugatmadi — birinchi bo‘ling!',
  boardMine: "Siz: #{rank}, {score}/75",
  boardJoin: "Ro'yxatga kirish uchun shu hafta to'liq testni tugating.",
  chatIntro: "🎙 <b>Chatda speaking testi</b>\n\nHar bir savol uchun: tayyorlaning, so'ng <b>🎤 tugmasini bosib turib ovozli xabar yuboring</b>. Javobingizdan keyin keyingi savol keladi. Erta tugatish uchun /finish yuboring.",
  partHeader: '📝 <b>{p}-qism · {name}</b> · {total} tadan {n}-savol',
  prepThenSpeak: '⏱ Tayyorlaning ({prep}), so‘ng 🎤 ovozli xabar yuboring ({speak} gacha).',
  forLabel: 'TARAFDOR',
  againstLabel: 'QARSHI',
  examiner: 'Imtihonchi',
  tooLong: "⏱ Xabaringiz {d} soniya, lekin chegara {limit}. Iltimos, qisqaroq javob yozib yuboring.",
  tooLarge: 'Yozuv juda katta. Iltimos, qisqaroq ovozli xabar yuboring.',
  waitNext: 'Iltimos, keyingi ovozli xabardan oldin navbatdagi savolni kuting.',
  noTest: 'Sizda boshlangan test yo‘q. Boshlash uchun pastdagi tugmani bosing.',
  checking: '⏳ Nutqingiz tekshirilmoqda… odatda bir daqiqadan kam vaqt oladi.',
  stillChecking: '⏳ Testingiz tekshirilmoqda. Natija tez orada shu yerga keladi.',
  checkFailed: "Kechirasiz, tekshirib bo'lmadi. Qayta urinish uchun /finish yuboring.",
  expired: "Bu testni davom ettirib bo'lmaydi. Yozilgan javoblar natijasini olish uchun /finish yuboring.",
  resultTitle: '📊 <b>Speaking natijangiz</b>',
  practiceTitle: '📊 <b>Mashq natijasi — {p}-qism</b>',
  score: 'Ball: <b>{score}/75</b> · Daraja: <b>{level}</b>',
  focus: '🎯 <b>Avvalo yaxshilang</b>',
  belowB1: 'B1 dan past',
  sec: '{n} soniya',
  min: '{n} daqiqa',
  buyTitle: "⭐ Telegram Stars orqali ko'proq test oling:",
  buyOff: "Hozircha xarid qilib bo'lmaydi. Bepul test olish uchun do'stlaringizni taklif qiling.",
  paid: "⭐ Rahmat! {n} ta test qo'shildi — endi sizda {total} ta.",
  paySupport: "💬 To'lov bo'yicha yordam: {contact}\nIltimos, chekdagi to'lov kodini yuboring. Ishlatilmagan xaridlar qaytarilishi mumkin.",
  NO_ATTEMPTS: "Testlaringiz qolmadi. Bepul test olish uchun do'stlaringizni taklif qiling.",
  ACTIVE_SESSION: 'Sizda tugallanmagan test bor. Avval uni davom ettiring.',
  NO_DRILLS: 'Bugungi bepul mashqlar tugadi. Ertaga qayting!',
  NO_ANSWERS: 'Hali hech qanday javob yozib olinmagan.',
  BUSY: 'Hali tekshirilmoqda… biroz kuting.',
};

const ru = {
  welcome: '👋 Привет{name}! Тренируйте <b>Multilevel speaking</b> на настоящих экзаменационных вопросах и получайте балл из 75, уровень и понятные советы — примерно за минуту.\n\n🎁 Первый тест <b>бесплатно</b>.\n👥 Пригласите {n} друзей в наш канал → <b>+1 бесплатный тест</b>.',
  joinFirst: '🔒 Чтобы начать, подпишитесь на наш канал и нажмите «Я подписался».',
  btnOpenApp: '🎤 Открыть приложение',
  btnVoice: '🎙 Пройти тест здесь голосовыми',
  btnInvite: '🎁 Пригласить друзей',
  btnTop: '🏆 Лучшие',
  btnLang: '🌐 Язык',
  btnJoin: '📢 Перейти в канал',
  btnJoined: '✅ Я подписался',
  btnShare: '📤 Поделиться ссылкой',
  btnTakeTest: '🎤 Пройти тест',
  btnFullFeedback: '📄 Подробный отзыв',
  btnFreeTest: '🎁 Пройти бесплатный тест',
  notInChannel: 'Мы пока не видим вас в канале. Подпишитесь и нажмите ещё раз.',
  joinedThanks: '🎉 Спасибо за подписку! Первый тест бесплатно.',
  menu: 'Что хотите сделать?',
  chooseLang: '🌐 Выберите язык:',
  langSaved: '✅ Язык: Русский',
  invite: '🎁 <b>Приглашайте друзей — получайте тесты</b>\n\nЗа каждых {per} друзей, подписавшихся на канал по вашей ссылке, вы получаете 1 бесплатный тест.\n\nВаша ссылка:\n{link}\n\nДрузей подписалось: <b>{total}</b> · до следующего теста: <b>{progress}/{per}</b>\nОсталось тестов: <b>{attempts}</b>',
  inviteShareText: '🎤 Тренируйте Multilevel speaking и получайте результат за минуту. Первый тест бесплатно!',
  balance: 'У вас осталось тестов: {n}.',
  refJoined: '👥 Друг подписался по вашей ссылке ({p}/{per}). Ещё {left} — и бесплатный тест ваш!',
  refReward: '🎉 По вашей ссылке подписалось друзей: {count} — вы получили ещё 1 бесплатный тест!\nОсталось тестов: {attempts}.',
  granted: '🎁 Вам начислено бесплатных тестов: {n}!',
  boardTitle: '🏆 <b>Лучшие на этой неделе</b>',
  boardEmpty: '🏆 На этой неделе ещё никто не прошёл тест — будьте первым!',
  boardMine: 'Вы: #{rank}, {score}/75',
  boardJoin: 'Пройдите полный тест на этой неделе, чтобы попасть в список.',
  chatIntro: '🎙 <b>Speaking-тест в чате</b>\n\nНа каждый вопрос: подготовьтесь, затем <b>удерживайте кнопку 🎤 и отправьте голосовое сообщение</b>. Следующий вопрос придёт после ответа. Чтобы закончить раньше, отправьте /finish.',
  partHeader: '📝 <b>Часть {p} · {name}</b> · вопрос {n} из {total}',
  prepThenSpeak: '⏱ Подготовьтесь ({prep}), затем отправьте 🎤 голосовое (до {speak}).',
  forLabel: 'ЗА',
  againstLabel: 'ПРОТИВ',
  examiner: 'Экзаменатор',
  tooLong: '⏱ Ваше сообщение длится {d} секунд, а лимит — {limit}. Запишите ответ покороче.',
  tooLarge: 'Запись слишком большая. Отправьте голосовое покороче.',
  waitNext: 'Дождитесь следующего вопроса, прежде чем отправлять новое голосовое.',
  noTest: 'У вас нет начатого теста. Нажмите кнопку ниже, чтобы начать.',
  checking: '⏳ Проверяем вашу речь… обычно это занимает меньше минуты.',
  stillChecking: '⏳ Ваш тест проверяется. Результат скоро придёт сюда.',
  checkFailed: 'Не удалось проверить. Отправьте /finish, чтобы попробовать снова.',
  expired: 'Этот тест уже нельзя продолжить. Отправьте /finish, чтобы получить результат по записанным ответам.',
  resultTitle: '📊 <b>Ваш результат по speaking</b>',
  practiceTitle: '📊 <b>Результат тренировки — часть {p}</b>',
  score: 'Балл: <b>{score}/75</b> · Уровень: <b>{level}</b>',
  focus: '🎯 <b>Что улучшить</b>',
  belowB1: 'Ниже B1',
  sec: '{n} сек',
  min: '{n} мин',
  buyTitle: '⭐ Больше тестов за Telegram Stars:',
  buyOff: 'Покупки сейчас недоступны. Пригласите друзей, чтобы получить бесплатные тесты.',
  paid: '⭐ Спасибо! Добавлено тестов: {n} — теперь у вас {total}.',
  paySupport: '💬 Помощь с оплатой: {contact}\nПришлите код платежа из чека. Неиспользованные покупки можно вернуть.',
  NO_ATTEMPTS: 'Тесты закончились. Пригласите друзей, чтобы получить бесплатный тест.',
  ACTIVE_SESSION: 'У вас есть незавершённый тест. Сначала продолжите его.',
  NO_DRILLS: 'Бесплатные тренировки на сегодня закончились. Возвращайтесь завтра!',
  NO_ANSWERS: 'Пока не записано ни одного ответа.',
  BUSY: 'Ещё проверяем… подождите немного.',
};

export const PART_NAMES = {
  en: { '1.1': 'Questions about you', '1.2': 'Picture questions', 2: 'Talk about a topic', 3: 'Discuss for and against' },
  uz: { '1.1': "O'zingiz haqingizda savollar", '1.2': 'Rasmlar bo‘yicha savollar', 2: 'Mavzu bo‘yicha gapirish', 3: 'Tarafdor va qarshi fikrlar' },
  ru: { '1.1': 'Вопросы о вас', '1.2': 'Вопросы по картинкам', 2: 'Рассказ на тему', 3: 'Аргументы за и против' },
};

const DICTS = { en, uz, ru };

/** t(key, vars) for a language; falls back to English. */
export function tr(lang) {
  const d = DICTS[lang] ?? en;
  return (key, vars = {}) => {
    let s = d[key] ?? en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export async function langOf(userId) {
  const u = await db.get(sql`SELECT feedback_lang FROM users WHERE id = ${userId}`);
  return u?.feedback_lang ?? 'en';
}

/** Translator for a user (by their saved language). */
export async function tFor(userId) {
  return tr(await langOf(userId));
}

export const levelName = (t, level) => (level === 'Below B1' ? t('belowB1') : level);

export const duration = (t, s) => (s >= 60 ? t('min', { n: s / 60 }) : t('sec', { n: s }));
