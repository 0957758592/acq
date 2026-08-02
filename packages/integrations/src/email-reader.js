import { EmailCodeFetcher } from './email-code.js';
import { createMailTmCodeReader } from './mailtm-code.js';
import { resolveMailbox } from './mail-providers.js';

// Resolve the RIGHT verification-code reader for an email address, by provider
// type — so every email type works end-to-end for shop confirmation:
//   - API-only providers (Mail.tm) → HTTP API reader (no IMAP exists)
//   - everything else               → IMAP EmailCodeFetcher (host from the catalog
//                                     or an explicit per-identity override)
// One `fetchLatestCode({limit})` contract either way, so the confirm flow never
// branches on the provider. Proton (bridge) / Firstmail (per-batch) supply their
// host explicitly and take the IMAP path.
export function createEmailCodeReader({ email, password, host = null, port = null, fetchImpl, ...opts } = {}) {
  const box = resolveMailbox(email, { imapHost: host, imapPort: port });
  if (box.apiOnly) {
    return createMailTmCodeReader({ email, password, fetchImpl, ...opts });
  }
  return new EmailCodeFetcher({
    email,
    password,
    host: box.imapHost || host || undefined,
    port: box.imapPort || port || undefined,
    ...opts
  });
}
