import { parseCookieDelivery } from '@acq/integrations';

// Browser (desktop) login for cookie-based accounts (TZ §9.4) — the path for
// platforms whose on-device app blocks automation (e.g. LinkedIn). Reads the
// account's VAULTED cookie delivery, restores a managed browser session with the
// cookies + user-agent, and verifies login BY FACT (navigate to the platform's
// authed URL; never fakes success). One op, every surface.
function seam(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

// Per-platform authed-URL + logged-in predicate. Extensible; unknown platform
// restores the cookies without a verify navigation (loggedIn stays best-effort).
const BROWSER_VERIFY = {
  linkedin: { url: 'https://www.linkedin.com/feed/', ok: (u) => /\/feed/.test(u) && !/\/login|\/uas|\/authwall|signup/i.test(u) },
  facebook: { url: 'https://www.facebook.com/', ok: (u) => !/login|checkpoint/i.test(u) },
  instagram: { url: 'https://www.instagram.com/', ok: (u) => !/accounts\/login/i.test(u) }
};

export async function browserLoginFromCookies(ctx, { accountId } = {}) {
  if (!accountId) throw seam('ACCOUNT_ID_REQUIRED', 'accountId is required');
  if (typeof ctx.cookieSessionRestore !== 'function') throw seam('BROWSER_LOGIN_UNAVAILABLE', 'cookie session restorer not wired (no browser backend)');
  const [doc] = await ctx.accountRepo.find({ _id: accountId });
  if (!doc) throw seam('ACCOUNT_NOT_FOUND', `account ${accountId} not found`);
  const ref = doc.secretRefs?.cookies;
  if (!ref) throw seam('NO_COOKIES', `account ${accountId} has no vaulted cookies (not a browser/cookie account)`);

  const raw = await ctx.credentialVault.resolve(ref);
  const { cookies, userAgent } = parseCookieDelivery(raw);
  if (!cookies.length) throw seam('NO_COOKIES', 'no cookies parsed from the vaulted delivery');

  const v = BROWSER_VERIFY[doc.platform] ?? { url: null, ok: () => true };
  const res = await ctx.cookieSessionRestore({ cookies, userAgent, verifyUrl: v.url, loggedInWhen: v.ok });

  return { accountId, platform: doc.platform, loggedIn: res.loggedIn, sessionId: res.sessionId, url: res.url, cookieCount: cookies.length };
}
