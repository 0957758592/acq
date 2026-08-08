import { createTelegramGramjsClient } from './telegram-gramjs.js';

// Fake GramJS binding — no network. Mirrors the shapes the real `telegram`
// package returns from client.getMessages / client.getParticipants.
function fakeGramjs({ messages = [], participants = [], onConnect } = {}) {
  class StringSession {
    constructor(s) { this.s = s; }
  }
  class TelegramClient {
    constructor(session, apiId, apiHash, opts) {
      Object.assign(this, { session, apiId, apiHash, opts, connects: 0, disconnected: false });
    }
    async connect() { this.connects += 1; onConnect?.(this); }
    async getMessages(chat, opts) { this.lastMessagesCall = { chat, opts }; return messages; }
    async getParticipants(chat, opts) { this.lastParticipantsCall = { chat, opts }; return participants; }
    async disconnect() { this.disconnected = true; }
  }
  return { StringSession, TelegramClient };
}

const cfg = { apiId: 2040, apiHash: 'b18441a1ff607e10a989891a5462e627', sessionString: '1AZ...' };

test('getMessages maps GramJS messages to the port shape and lazy-connects once', async () => {
  const gramjs = fakeGramjs({
    messages: [
      { id: 10, message: 'hi', date: 1786036411, sender: { username: 'alice' } },
      { id: 11, message: '', date: 1786036500, senderId: 8487949275n }
    ]
  });
  const client = createTelegramGramjsClient({ ...cfg, gramjs });
  const first = await client.getMessages({ chat: '@durov', limit: 2 });
  const second = await client.getMessages({ chat: '@durov', limit: 2 });
  expect(first).toEqual([
    { id: 10, message: 'hi', senderUsername: 'alice', date: 1786036411 },
    { id: 11, message: '', senderUsername: '8487949275', date: 1786036500 }
  ]);
  // lazy singleton: the underlying client connects exactly once across calls
  expect(client._raw().connects).toBe(1);
  expect(second).toHaveLength(2);
  expect(client._raw().lastMessagesCall).toEqual({ chat: '@durov', opts: { limit: 2 } });
});

test('getParticipants maps entities to {username,id,isAdmin}', async () => {
  const gramjs = fakeGramjs({
    participants: [
      { username: 'bob', id: 123n, isAdmin: true },
      { username: undefined, id: 456n }
    ]
  });
  const client = createTelegramGramjsClient({ ...cfg, gramjs });
  const users = await client.getParticipants({ chat: '@durov', limit: 50 });
  expect(users).toEqual([
    { username: 'bob', id: '123', isAdmin: true },
    { username: null, id: '456', isAdmin: false }
  ]);
});

test('the client is constructed with the injected api creds + session', async () => {
  let seen;
  const gramjs = fakeGramjs({ onConnect: (c) => { seen = c; } });
  const client = createTelegramGramjsClient({ ...cfg, gramjs });
  await client.getMessages({ chat: '@x', limit: 1 });
  expect(seen.apiId).toBe(2040);
  expect(seen.apiHash).toBe('b18441a1ff607e10a989891a5462e627');
  expect(seen.session).toBeInstanceOf(gramjs.StringSession);
  expect(seen.session.s).toBe('1AZ...');
});

test('disconnect tears the underlying client down when it was opened', async () => {
  const gramjs = fakeGramjs({ messages: [] });
  const client = createTelegramGramjsClient({ ...cfg, gramjs });
  await client.getMessages({ chat: '@x', limit: 1 });
  const opened = client._raw();
  await client.disconnect();
  expect(opened.disconnected).toBe(true);
  // reset so a later call reconnects a fresh socket
  expect(client._raw()).toBeNull();
});

test('missing config or gramjs binding -> coded seam (no throw at scrape time swallowed)', async () => {
  expect(() => createTelegramGramjsClient({ apiId: 1, apiHash: 'h', sessionString: 's' }))
    .toThrow(/MTPROTO_CONFIG_MISSING/);
  const gramjs = fakeGramjs({});
  expect(() => createTelegramGramjsClient({ apiId: 1, apiHash: 'h', gramjs }))
    .toThrow(/MTPROTO_CONFIG_MISSING/);
});
