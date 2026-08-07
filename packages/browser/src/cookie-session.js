// Restore a logged-in browser session from account cookies (TZ §9.4 desktop path).
// The BROWSER login path for platforms whose on-device app blocks automation
// (e.g. LinkedIn): open a managed browser session, set the account's cookies +
// user-agent, navigate to a verify URL, and confirm login BY FACT (never faked).
// `browserProvider` mints the session (own pool / browserbase); `connect(cdpUrl)`
// is the injected Puppeteer connector -> { page, close } (real one wraps
// puppeteer.connect; tests fake it). Returns the live session + loggedIn fact.
export function createCookieSessionRestorer({ browserProvider, connect } = {}) {
  if (!browserProvider) throw new Error('createCookieSessionRestorer requires a browserProvider');
  if (typeof connect !== 'function') throw new Error('createCookieSessionRestorer requires a connect(cdpUrl) fn');

  return async function restore({ cookies = [], userAgent = null, verifyUrl, loggedInWhen, keepOpen = false } = {}) {
    if (!Array.isArray(cookies) || !cookies.length) {
      throw Object.assign(new Error('COOKIE_SESSION_NO_COOKIES: no cookies to restore'), { code: 'COOKIE_SESSION_NO_COOKIES' });
    }
    const session = await browserProvider.createSession({});
    const { page, close } = await connect(session.cdpUrl);
    let loggedIn = false;
    let finalUrl = null;
    try {
      if (userAgent && page.setUserAgent) await page.setUserAgent(userAgent);
      await page.setCookie(...cookies);
      if (verifyUrl) {
        await page.goto(verifyUrl, { waitUntil: 'domcontentloaded', timeout: 35_000 });
        finalUrl = page.url();
        loggedIn = typeof loggedInWhen === 'function' ? Boolean(loggedInWhen(finalUrl)) : true;
      }
    } finally {
      if (!keepOpen) await close().catch(() => {});
    }
    return { sessionId: session.sessionId, cdpUrl: session.cdpUrl, url: finalUrl, loggedIn };
  };
}
