// POST /api/upload_answer — one base64 chunk of a recorded answer:
// { session, key, index, total, mime, data }. The last chunk triggers transcription.
import { getOwnSession, receiveChunk } from '../lib/sessions.js';

export default async function (input, ctx) {
  const session = await getOwnSession(input.session, ctx.initData.user.id);
  return receiveChunk(session, input);
}
