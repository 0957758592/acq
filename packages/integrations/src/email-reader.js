import { EmailCodeFetcher } from './email-code.js';
import { createMailTmCodeReader } from './mailtm-code.js';
import { createOneSecMailCodeReader } from './onesecmail-code.js';
import { resolveMailbox } from './mail-providers.js';

// Registry of API-backed readers for api-only providers (no IMAP). Adding an
// api-only email type is a registry entry keyed by its catalog provider id —
// no branching in the resolver (Open/Closed).
const API_CODE_READERS = {
  mailtm: createMailTmCodeReader,
  onesecmail: createOneSecMailCodeReader
};

// Resolve the RIGHT verification-code reader for an email address, by provider
// type — so every email type works end-to-end for shop confirmation:
//   - API-only providers (Mail.tm, 1secmail) → their HTTP API reader (no IMAP)
//   - everything else                         → IMAP EmailCodeFetcher (host from
//                                               the catalog or an explicit override)
// One `fetchLatestCode({limit})` contract either way, so the confirm flow never
// branches on the provider. Proton (bridge) / Firstmail (per-batch) supply their
// host explicitly and take the IMAP path.
export function createEmailCodeReader({ email, password, host = null, port = null, fetchImpl, ...opts } = {}) {
  const box = resolveMailbox(email, { imapHost: host, imapPort: port });
  if (box.apiOnly) {
    const make = API_CODE_READERS[box.provider];
    if (!make) throw Object.assign(new Error(`EMAIL_API_READER_UNSUPPORTED: no API code reader for provider '${box.provider}'`), { code: 'EMAIL_API_READER_UNSUPPORTED' });
    return make({ email, password, fetchImpl, ...opts });
  }
  return new EmailCodeFetcher({
    email,
    password,
    host: box.imapHost || host || undefined,
    port: box.imapPort || port || undefined,
    ...opts
  });
}
