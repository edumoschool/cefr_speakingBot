// POST /api/set_prefs — { lang: 'en' | 'uz' | 'ru' }. Language of the examiner's feedback.
import { EndpointError } from 'sdk';
import { LANGS } from '../lib/grading.js';
import { setFeedbackLang } from '../lib/users.js';

export default async function (input, ctx) {
  if (!Object.hasOwn(LANGS, input.lang)) throw new EndpointError('Unknown language', { code: 'BAD_REQUEST' });
  await setFeedbackLang(ctx.initData.user.id, input.lang);
  return { lang: input.lang };
}
