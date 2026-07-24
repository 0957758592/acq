import { createTelegramMtprotoAdapter } from './telegram-mtproto.js';

// A fake MTProto client (the real one is a GramJS/telethon-class session — the
// verify-by-fact input needing api_id/api_hash + a user session).
function fakeClient() {
  return {
    async getMessages({ chat, limit }) {
      return [
        { id: 11, message: 'full history msg 1', senderUsername: 'ann', date: 1700000000, chat, limit },
        { id: 12, message: 'full history msg 2', senderUsername: 'bob', date: 1700000100 }
      ];
    },
    async getParticipants({ chat }) {
      return [
        { username: 'ann', isAdmin: true, chat },
        { username: 'bob' },
        { username: 'carol' },
        { id: 999 } // no username → falls back to id
      ];
    }
  };
}

describe('createTelegramMtprotoAdapter (api-class tier, full history + full roster)', () => {
  it('maps messages → {id,text,author,ts} for the normalizer', async () => {
    const adapter = createTelegramMtprotoAdapter({ client: fakeClient() });
    const { rawItems } = await adapter.scrape({ platform: 'telegram', targetType: 'messages', target: 'g1', params: { limit: 50 } });
    expect(rawItems).toEqual([
      { id: 11, text: 'full history msg 1', author: 'ann', ts: 1700000000 },
      { id: 12, text: 'full history msg 2', author: 'bob', ts: 1700000100 }
    ]);
  });

  it('maps participants → {handle,role}, enumerating the FULL roster (beyond Bot API admins)', async () => {
    const adapter = createTelegramMtprotoAdapter({ client: fakeClient() });
    const { rawItems } = await adapter.scrape({ platform: 'telegram', targetType: 'participants', target: 'g1', params: {} });
    expect(rawItems).toEqual([
      { handle: 'ann', role: 'admin' },
      { handle: 'bob', role: 'member' },
      { handle: 'carol', role: 'member' },
      { handle: '999', role: 'member' }
    ]);
  });

  it('is an honest coded seam when no client is wired (needs api_id/api_hash + session)', async () => {
    const adapter = createTelegramMtprotoAdapter({});
    await expect(adapter.scrape({ platform: 'telegram', targetType: 'messages', target: 'g', params: {} }))
      .rejects.toMatchObject({ code: 'MTPROTO_CLIENT_UNAVAILABLE' });
  });

  it('rejects an unsupported target type', async () => {
    const adapter = createTelegramMtprotoAdapter({ client: fakeClient() });
    await expect(adapter.scrape({ platform: 'telegram', targetType: 'stories', target: 'g', params: {} }))
      .rejects.toMatchObject({ code: 'SCRAPE_TARGET_UNSUPPORTED' });
  });
});
