// Local stand-in for the platform's `sdk`. Bot API calls are recorded and
// answered with fakes; `fetch` is the real one unless a test swaps it.
import db from './db.js';

export { db };

export class EndpointError extends Error {
  constructor(description, parameters = {}) { super(description); this.description = description; this.parameters = parameters; }
}
export class BotApiError extends Error {
  constructor(method, code, description) { super(description); this.method = method; this.code = code; this.description = description; }
}
export class InputFile { constructor(bytes, name, opts = {}) { this.bytes = bytes; this.name = name; this.type = opts.type; } }

export const fake = {
  sent: [], // every Bot API call: { method, params }
  channelMembers: new Set(),
  allMembers: false, // dev server: treat everyone as a channel member
  me: { id: 1, is_bot: true, username: 'dev_speaking_bot' },
  files: new Map(), // file_id → Uint8Array, for api.getFileContent
  fetch: (...a) => globalThis.fetch(...a),
};

export const api = new Proxy({}, {
  get: (_, method) => async (params = {}) => {
    fake.sent.push({ method, params });
    if (method === 'getMe') return fake.me;
    if (method === 'getChatMember') {
      if (params.user_id === fake.me.id) return { status: 'administrator' };
      return { status: fake.allMembers || fake.channelMembers.has(params.user_id) ? 'member' : 'left', user: { id: params.user_id } };
    }
    if (method === 'getFileContent') {
      const f = fake.files.get(typeof params === 'string' ? params : params.file_id);
      if (!f) throw new BotApiError(method, 400, 'Bad Request: invalid file_id');
      return f;
    }
    if (method === 'sendMessage') return { message_id: fake.sent.length, chat: { id: params.chat_id }, text: params.text };
    return true;
  },
});

export const fetch = (...a) => fake.fetch(...a);
