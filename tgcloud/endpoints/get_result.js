// POST /api/get_result — { id }. A finished mock's full result.
import { EndpointError } from 'sdk';
import { getOwnSession } from '../lib/sessions.js';

export default async function (input, ctx) {
  const s = await getOwnSession(input.id, ctx.initData.user.id);
  if (s.status !== 'done') throw new EndpointError('This mock has not been assessed yet.', { code: 'NOT_READY' });
  return { id: s.id, result: JSON.parse(s.result) };
}
