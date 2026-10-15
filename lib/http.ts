import { env } from './env.js';
import { verifyInitData, type InitData } from './telegram.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Wraps a handler so thrown HttpErrors become JSON responses and anything else a 500. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: 'internal', message: 'Something went wrong. Please try again.' }, 500);
    }
  };
}

/** The Mini App sends Telegram.WebApp.initData in this header on every request. */
export function requireAuth(req: Request): InitData {
  const raw = req.headers.get('x-telegram-init-data') ?? '';
  const data = verifyInitData(raw, env.botToken);
  if (!data) throw new HttpError(401, 'Please open this app from Telegram.', 'unauthorized');
  return data;
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body', 'bad_request');
  }
}
