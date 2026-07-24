import { domainError } from '@acq/engine-domain';

// Telegram MTProto scrape adapter (TZ §10.1) — the api-CLASS tier that goes
// beyond the Bot API: FULL message history and the FULL participant roster of a
// group (not just admins / recently-received updates). Talks to an INJECTED
// MTProto `client` port (a GramJS/telethon-class user session) — the real
// connection needs api_id/api_hash + a user session (verify-by-fact). Absent a
// client it is an honest coded seam; the map→normalize path is real and generic.
//
// client port:
//   getMessages({ chat, limit })     -> [{ id, message|text, senderUsername|sender, date }]
//   getParticipants({ chat, limit }) -> [{ username|id, isAdmin|role }]
export function createTelegramMtprotoAdapter({ client } = {}) {
  return {
    async scrape({ targetType, target, params = {} }) {
      if (!client?.getMessages || !client?.getParticipants) {
        throw domainError('MTPROTO_CLIENT_UNAVAILABLE', 'no telegram mtproto client wired (needs api_id/api_hash + session)');
      }
      const limit = params.limit ?? 500;

      if (targetType === 'messages') {
        const msgs = (await client.getMessages({ chat: target, limit })) ?? [];
        return {
          rawItems: msgs.map((m) => ({
            id: m.id,
            text: m.message ?? m.text ?? '',
            author: m.senderUsername ?? m.sender ?? m.fromId ?? '',
            ts: m.date ?? null
          }))
        };
      }
      if (targetType === 'participants' || targetType === 'members') {
        const users = (await client.getParticipants({ chat: target, limit })) ?? [];
        return {
          rawItems: users.map((u) => ({
            handle: u.username ?? (u.id != null ? String(u.id) : ''),
            role: u.role ?? (u.isAdmin ? 'admin' : 'member')
          }))
        };
      }
      throw domainError('SCRAPE_TARGET_UNSUPPORTED', `telegram mtproto has no '${targetType}' target`);
    }
  };
}
