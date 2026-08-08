import { createTelegramGramjsClient } from '@acq/integrations';

// Builds the MTProto tier's user-session client from resolved config. Returns
// null when the session/api creds are absent so the scrape worker simply runs
// WITHOUT the mtproto tier (a params.via='mtproto' scrape then surfaces the
// SCRAPE_TIER_UNAVAILABLE seam) — present-but-broken config is the client's own
// coded-seam concern. `gramjs` ({ TelegramClient, StringSession }) and
// `createClient` are injected so this is unit-testable without the real socket
// library; the running worker passes the real `telegram` package.
export function buildMtprotoClientFromEnv({ apiId, apiHash, sessionString, gramjs, createClient = createTelegramGramjsClient } = {}) {
  if (!apiId || !apiHash || !sessionString || !gramjs?.TelegramClient || !gramjs?.StringSession) return null;
  return createClient({ apiId, apiHash, sessionString, gramjs });
}
