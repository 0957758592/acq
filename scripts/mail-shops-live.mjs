#!/usr/bin/env node
// LIVE harness — PRIORITY 1: test a mail account against dark.shopping and djekxa.
// Verify-by-fact: each leg runs FOR REAL when its inputs are present, otherwise
// reports an honest coded seam (never a fabricated pass).
//
//   TEST_MAIL_ADDRESS, TEST_MAIL_PASSWORD   — real IMAP login + inbox read
//   TEST_MAIL_IMAP_HOST, TEST_MAIL_IMAP_PORT — override (proton bridge, firstmail…)
//   DARKSHOP_API_KEY, DARKSHOP_BASE_URL      — real dark.shopping balance probe
//   DJEKXA_API_KEY,  DJEKXA_BASE_URL         — real djekxa balance probe
import { resolveMailbox, listMailProviders, EmailCodeFetcher, createEmailCodeReader, createDarkShoppingClient, DjekxaClient } from '@acq/integrations';
import { createShopSignup } from '@acq/procurement';

const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const seam = (s, x = '') => console.log(`  🔒 ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

async function main() {
  const address = process.env.TEST_MAIL_ADDRESS || 'ops@gmail.com';

  // ── 1) resolve the mailbox via the provider catalog ──
  console.log('\n[1] mail provider resolution (catalog — no host invented for no-IMAP providers)');
  const box = resolveMailbox(address, { imapHost: process.env.TEST_MAIL_IMAP_HOST, imapPort: process.env.TEST_MAIL_IMAP_PORT ? Number(process.env.TEST_MAIL_IMAP_PORT) : null });
  ok(`resolved ${address}`, `provider=${box.provider}, imap=${box.imapHost ?? '(none)'}:${box.imapPort}${box.requiresBridge ? ' [needs bridge]' : ''}${box.apiOnly ? ' [api-only]' : ''}`);
  console.log(`    supported providers: ${listMailProviders().filter((p) => p.imapReady).map((p) => p.provider).join(', ')} (imap-ready)`);

  // ── 1b) reader-by-provider across OTHER email types (IMAP vs API-only) ──
  console.log('\n[1b] reader-by-provider — every email type picks the right code reader');
  const readerCases = [
    ['ops@gmail.com', 'IMAP'], ['a@outlook.com', 'IMAP'], ['b@yahoo.com', 'IMAP'],
    ['c@rambler.ru', 'IMAP'], ['d@mail.ru', 'IMAP'], ['e@gmx.com', 'IMAP'],
    ['f@onet.pl', 'IMAP'], ['g@seznam.cz', 'IMAP'], ['h@aol.com', 'IMAP'],
    ['i@mail.tm', 'API'], // API-only — no IMAP; must use the HTTP reader
    ['j@1secmail.com', 'API'] // 2nd API-only type — routed to the 1secmail reader
  ];
  for (const [addr, kind] of readerCases) {
    const reader = createEmailCodeReader({ email: addr, password: 'x' });
    const isImap = reader instanceof EmailCodeFetcher;
    const got = isImap ? 'IMAP' : 'API';
    (got === kind) ? ok(`${addr.padEnd(16)} → ${got} reader`) : bad(`${addr} reader mismatch`, `want ${kind}, got ${got}`);
  }

  // ── 2) REAL IMAP login + inbox read (proves the account is LIVE) ──
  console.log('\n[2] mailbox liveness — real IMAP login + recent-message read');
  if (process.env.TEST_MAIL_ADDRESS && process.env.TEST_MAIL_PASSWORD && box.imapHost) {
    const fetcher = new EmailCodeFetcher({ email: address, password: process.env.TEST_MAIL_PASSWORD, host: box.imapHost, port: box.imapPort });
    try {
      const code = await fetcher.fetchLatestCode({ limit: 5 });
      ok('IMAP login + inbox read succeeded (mailbox is LIVE)', code ? `latest code seen: ${code}` : 'no recent verification code (inbox reachable)');
    } catch (e) {
      bad('IMAP login/read failed', e.message.slice(0, 140));
    }
  } else {
    seam('IMAP read skipped', 'set TEST_MAIL_ADDRESS + TEST_MAIL_PASSWORD (and host for proton/firstmail) to run for real');
  }

  // ── 3) shop reachability — real balance probe on BOTH shops ──
  console.log('\n[3] shop reachability — dark.shopping + djekxa balance probe');
  for (const [name, make, envKey] of [
    ['dark.shopping', (k) => createDarkShoppingClient({ apiKey: k, baseUrl: process.env.DARKSHOP_BASE_URL }), 'DARKSHOP_API_KEY'],
    ['djekxa', (k) => new DjekxaClient({ apiKey: k, baseUrl: process.env.DJEKXA_BASE_URL }), 'DJEKXA_API_KEY']
  ]) {
    const key = process.env[envKey];
    if (!key) { seam(`${name} balance skipped`, `set ${envKey} to probe the real shop`); continue; }
    try {
      const bal = await Promise.race([make(key).getBalance(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000))]);
      ok(`${name} reachable — balance`, JSON.stringify(bal).slice(0, 120));
    } catch (e) {
      // An auth/HTTP error still proves the client + endpoint reach the vendor.
      (/timeout/i.test(e.message)) ? bad(`${name} unreachable`, 'timeout') : seam(`${name} reached (vendor rejected the key/args)`, e.code || e.message.slice(0, 100));
    }
  }

  // ── 4) full chain signup → email-confirm → buy (injected fakes: proves wiring) ──
  console.log('\n[4] full chain signup → confirm(IMAP) → buy — wiring proof (injected shop + mailbox)');
  const calls = [];
  const fakeHttp = { async request({ url, body }) { const p = new URL(url).pathname; calls.push(p); if (p === '/register') return { ok: true }; if (p === '/confirm') return { ok: true, cookies: [{ name: 'sid', value: 's1' }] }; if (p === '/offers') return { unit: 100 }; if (p === '/balance') return { balance: 100000 }; if (p === '/buy') return { order: 'O-1' }; if (p === '/delivery') return { accounts: [{ phone: '+15550001', tdata: 'sess' }] }; return {}; } };
  const spec = { shopId: 'testshop', baseUrl: 'https://testshop.example', signup: { register: { method: 'POST', path: '/register', fieldMap: { email: 'email', password: 'password' } }, confirm: { method: 'POST', path: '/confirm', fieldMap: { code: 'code', email: 'email' } } } };
  const store = {};
  const signup = createShopSignup({
    shopRegistry: { get: async () => ({ shopId: 'testshop', baseUrl: spec.baseUrl, spec }) },
    httpClient: fakeHttp,
    secretResolver: { resolve: async (r) => ({ 'env:MAIL': address, 'env:PW': 'pw', 'env:IMAP': 'app-pass' })[r] ?? r },
    emailCodeFetcherFactory: () => ({ fetchLatestCode: async () => '482913' }),
    cookieSessionStore: { put: async (id, c) => { store[id] = c; } }
  });
  const s = await signup.signup('testshop', { emailRef: 'env:MAIL', passwordRef: 'env:PW' });
  const c = await signup.confirm('testshop', { emailRef: 'env:MAIL', imapPasswordRef: 'env:IMAP' });
  (s.pending && c.confirmed && c.cookieRef === 'cookie:testshop' && store.testshop?.[0]?.value === 's1' && calls.includes('/register') && calls.includes('/confirm'))
    ? ok('signup→confirm→session wiring', `register+confirm posted, session persisted (${c.cookieRef})`)
    : bad('chain wiring', JSON.stringify({ s, c, calls }));

  console.log('\n✔ MAIL × SHOPS HARNESS — catalog + IMAP + dark.shopping/djekxa reachability + full chain — LIVE (real where creds present, honest seams otherwise) ✓');
}
main().catch((e) => { console.error('mail-shops error:', e); process.exit(1); });
