import { domainError } from '@acq/engine-domain';

// Real MTProto user-session client backed by GramJS (the `telegram` npm pkg),
// implementing the injected `client` port that createTelegramMtprotoAdapter
// expects (TZ §10.1): getMessages({chat,limit}) + getParticipants({chat,limit}).
//
// The auth lives in a Telethon-format StringSession (delivered inside the shop
// account's .json as `session_string`). A StringSession carries the DC +
// auth_key, so it MUST be opened with the SAME api_id/api_hash it was minted
// with (TDesktop's 2040 for these accounts) — a mismatched app id risks an
// auth-key logout. The `gramjs` binding ({ TelegramClient, StringSession }) is
// injected so the mapping is unit-testable without a socket; composition passes
// the real package. Connection is lazy + memoised (one socket per client).
export function createTelegramGramjsClient({ apiId, apiHash, sessionString, gramjs, connectionRetries = 3 } = {}) {
  if (!apiId || !apiHash || !sessionString || !gramjs?.TelegramClient || !gramjs?.StringSession) {
    throw domainError('MTPROTO_CONFIG_MISSING', 'needs apiId, apiHash, sessionString and a gramjs binding');
  }

  let raw = null;
  let connecting = null;
  async function connected() {
    if (raw) return raw;
    if (!connecting) {
      connecting = (async () => {
        const session = new gramjs.StringSession(sessionString);
        const client = new gramjs.TelegramClient(session, Number(apiId), String(apiHash), { connectionRetries });
        await client.connect();
        raw = client;
        return client;
      })();
    }
    return connecting;
  }

  return {
    async getMessages({ chat, limit } = {}) {
      const client = await connected();
      const msgs = (await client.getMessages(chat, { limit })) ?? [];
      return msgs.map((m) => ({
        id: m.id,
        message: m.message ?? m.text ?? '',
        senderUsername: m.sender?.username ?? (m.senderId != null ? String(m.senderId) : null),
        date: m.date ?? null
      }));
    },
    async getParticipants({ chat, limit } = {}) {
      const client = await connected();
      const users = (await client.getParticipants(chat, { limit })) ?? [];
      return users.map((u) => ({
        username: u.username ?? null,
        id: u.id != null ? String(u.id) : null,
        isAdmin: !!u.isAdmin
      }));
    },
    async disconnect() {
      if (raw) { await raw.disconnect?.(); raw = null; connecting = null; }
    },
    // test/introspection seam — the live underlying GramJS client (or null)
    _raw() { return raw; }
  };
}
