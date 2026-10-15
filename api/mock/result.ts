import { handler, HttpError, json, requireAuth } from '../../lib/http.js';
import { getOwnSession } from '../../lib/sessions.js';

export const GET = handler(async (req) => {
  const { user } = requireAuth(req);
  const s = await getOwnSession(new URL(req.url).searchParams.get('id') ?? '', user.id);
  if (s.status !== 'done') throw new HttpError(409, 'This mock has not been assessed yet.', 'not_ready');
  return json({ id: s.id, result: s.result });
});
