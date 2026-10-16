import { tg } from './telegram';
import type { Me, MockResult, StartResponse } from './types';

export class ApiError extends Error {
  /**
   * `code`: the endpoint's EndpointError code (or the platform error type); `type`: ENDPOINT_ERROR, UNAUTHORIZED, …;
   * `status`: the HTTP status, 0 when the request never completed (offline, timeout).
   */
  constructor(message: string, public code: string, public type = 'ERROR', public status?: number) {
    super(message);
  }
}

/**
 * Calls a tgcloud endpoint (tgcloud/endpoints/<name>.js) through the official
 * Telegram.WebApp.Serverless.call, which attaches the verified init data.
 * On localhost without Telegram it falls back to the local dev server.
 */
export function call<T>(name: string, input: Record<string, unknown> = {}): Promise<T> {
  const serverless = tg?.Serverless;
  if (serverless && tg?.initData) {
    return new Promise((resolve, reject) =>
      serverless.call(name, input, (err, result) => {
        if (err) reject(new ApiError(err.message || 'Request failed', err.parameters?.code ?? err.type ?? 'ERROR', err.type ?? 'ERROR', err.status));
        else resolve(result as T);
      }),
    );
  }
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return devCall<T>(name, input);
  return Promise.reject(new ApiError('Please open this app from the Telegram bot.', 'NO_TELEGRAM'));
}

// Local development only (dev/server.mjs): the user comes from ?user=<id>&start=<param>.
async function devCall<T>(name: string, input: Record<string, unknown>): Promise<T> {
  const q = new URLSearchParams(location.search);
  const init = { user: { id: Number(q.get('user') ?? 1001), first_name: q.get('name') ?? 'Dev' }, start_param: q.get('start') ?? undefined };
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-init': JSON.stringify(init) },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) throw new ApiError(data.description ?? 'Request failed', data.parameters?.code ?? data.error_type ?? 'ERROR', data.error_type ?? 'ERROR', res.status);
  return data.result as T;
}

export const api = {
  me: () => call<Me>('me'),
  startMock: () => call<StartResponse>('start_mock'),
  startDrill: (part: string) => call<StartResponse>('start_drill', { part }),
  uploadChunk: (input: { session: string; key: string; index: number; total: number; mime: string; data: string }) =>
    call<{ done: boolean }>('upload_answer', input),
  gradePart: (session: string, part: string) => call<{ ok: true }>('grade_part', { session, part }),
  finish: (session: string) => call<{ id: string; result: MockResult }>('finish_mock', { session }),
  setPrefs: (lang: string) => call<{ lang: string }>('set_prefs', { lang }),
  createInvoice: (pack: string) => call<{ link: string }>('create_invoice', { pack }),
  result: (id: string) => call<{ id: string; result: MockResult }>('get_result', { id }),
};
