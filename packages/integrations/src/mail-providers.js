// Mail provider catalog (TZ §6.4/§7.2). ONE place that knows how to reach a
// mailbox for verification-code reading, so nothing else guesses IMAP hosts.
// Every entry declares its domains, IMAP coordinates and any real-world caveat
// (app-password, no direct IMAP, API-only). Providers whose host we do NOT know
// for a fact are marked `imapHost: null` — the operator supplies it explicitly
// (verify-by-fact: we never invent a hostname).
export const MAIL_PROVIDERS = {
  gmail: {
    label: 'Gmail / Google Workspace',
    domains: ['gmail.com', 'googlemail.com'],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    note: 'App password required when 2FA is on; IMAP must be enabled.'
  },
  outlook: {
    label: 'Outlook / Hotmail / Live',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    note: 'Modern auth (OAuth) may be enforced on newer tenants; app password otherwise.'
  },
  yahoo: {
    label: 'Yahoo Mail',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    note: 'App password required.'
  },
  aol: {
    label: 'AOL Mail',
    domains: ['aol.com'],
    imapHost: 'imap.aol.com',
    imapPort: 993,
    note: 'App password required.'
  },
  gmx: {
    label: 'GMX',
    domains: ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch'],
    imapHost: 'imap.gmx.com',
    imapPort: 993,
    note: 'IMAP must be enabled in the account settings.'
  },
  mailcom: {
    label: 'Mail.com',
    domains: ['mail.com', 'email.com', 'usa.com', 'consultant.com'],
    imapHost: 'imap.mail.com',
    imapPort: 993,
    note: 'IMAP must be enabled in the account settings.'
  },
  rambler: {
    label: 'Rambler',
    domains: ['rambler.ru', 'lenta.ru', 'autorambler.ru', 'myrambler.ru', 'ro.ru'],
    imapHost: 'imap.rambler.ru',
    imapPort: 993,
    note: ''
  },
  mailru: {
    label: 'Mail.ru',
    domains: ['mail.ru', 'inbox.ru', 'bk.ru', 'list.ru', 'internet.ru'],
    imapHost: 'imap.mail.ru',
    imapPort: 993,
    note: 'App password required for external clients.'
  },
  onet: {
    label: 'Onet Poczta',
    domains: ['onet.pl', 'op.pl', 'poczta.onet.pl'],
    imapHost: 'imap.poczta.onet.pl',
    imapPort: 993,
    note: ''
  },
  seznam: {
    label: 'Seznam.cz',
    domains: ['seznam.cz', 'email.cz', 'post.cz', 'spoluzaci.cz'],
    imapHost: 'imap.seznam.cz',
    imapPort: 993,
    note: ''
  },
  proton: {
    label: 'Proton Mail',
    domains: ['protonmail.com', 'proton.me', 'pm.me'],
    // Proton has NO public IMAP: reading requires the local Proton Mail Bridge,
    // which exposes IMAP on 127.0.0.1. Point the identity at the bridge host.
    imapHost: null,
    imapPort: 1143,
    requiresBridge: true,
    note: 'No public IMAP — run Proton Mail Bridge and set imapHost to the bridge (127.0.0.1:1143).'
  },
  mailtm: {
    label: 'Mail.tm (disposable, API-only)',
    domains: ['mail.tm'],
    imapHost: null,
    imapPort: null,
    apiOnly: true,
    note: 'HTTP API only — no IMAP. Use an API-backed code reader, not EmailCodeFetcher.'
  },
  firstmail: {
    label: 'Firstmail (reseller)',
    domains: ['firstmail.ltd', 'firstmail.com'],
    // Reseller domains rotate; the host is per-batch — supply it explicitly.
    imapHost: null,
    imapPort: 993,
    note: 'Host varies per batch — set imapHost explicitly on the identity.'
  },
  custom: {
    label: 'Custom / self-hosted IMAP',
    domains: [],
    imapHost: null,
    imapPort: 993,
    note: 'Any IMAP server — supply imapHost/imapPort on the identity.'
  }
};

const DOMAIN_INDEX = new Map();
for (const [id, spec] of Object.entries(MAIL_PROVIDERS)) {
  for (const domain of spec.domains) DOMAIN_INDEX.set(domain, id);
}

export function listMailProviders() {
  return Object.entries(MAIL_PROVIDERS).map(([provider, spec]) => ({
    provider,
    label: spec.label,
    domains: spec.domains,
    imapHost: spec.imapHost,
    imapPort: spec.imapPort,
    // `imapReady` = we can reach it with the built-in IMAP reader out of the box.
    imapReady: Boolean(spec.imapHost),
    requiresBridge: Boolean(spec.requiresBridge),
    apiOnly: Boolean(spec.apiOnly),
    note: spec.note
  }));
}

export function providerIdForAddress(address) {
  const domain = String(address || '').split('@')[1]?.toLowerCase();
  if (!domain) return null;
  return DOMAIN_INDEX.get(domain) ?? null;
}

// Resolve the IMAP coordinates for an address. An explicit host always wins
// (per-identity override); an unknown domain falls back to the conventional
// `imap.<domain>` only as a hint, flagged `inferred: true` so callers know it
// was not verified.
export function resolveMailbox(address, { imapHost = null, imapPort = null } = {}) {
  const providerId = providerIdForAddress(address);
  const spec = providerId ? MAIL_PROVIDERS[providerId] : null;
  const domain = String(address || '').split('@')[1]?.toLowerCase() || '';
  // A KNOWN provider that declares no IMAP (Proton/Mail.tm/reseller batches)
  // stays null — we never invent `imap.<domain>` for it. The conventional guess
  // is only a hint for domains the catalog does not know at all.
  const known = Boolean(spec);
  const host = imapHost || (known ? spec.imapHost : domain ? `imap.${domain}` : null);
  return {
    provider: providerId ?? 'custom',
    imapHost: host,
    imapPort: imapPort || spec?.imapPort || 993,
    inferred: !imapHost && !known && Boolean(host),
    apiOnly: Boolean(spec?.apiOnly),
    requiresBridge: Boolean(spec?.requiresBridge),
    note: spec?.note ?? ''
  };
}
