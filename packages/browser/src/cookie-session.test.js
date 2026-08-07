import { createCookieSessionRestorer } from './cookie-session.js';

function fakeBrowser({ finalUrl = 'https://www.linkedin.com/feed/' } = {}) {
  const calls = { setUA: null, cookies: null, gotoUrl: null, closed: false };
  const page = {
    setUserAgent: async (ua) => { calls.setUA = ua; },
    setCookie: async (...cs) => { calls.cookies = cs; },
    goto: async (url) => { calls.gotoUrl = url; },
    url: () => finalUrl
  };
  return {
    calls,
    browserProvider: { createSession: async () => ({ sessionId: 'sess-1', cdpUrl: 'ws://cdp' }) },
    connect: async () => ({ page, close: async () => { calls.closed = true; } })
  };
}

const cookies = [{ name: 'li_at', value: 'X', domain: '.linkedin.com', path: '/' }];

test('restores cookies + UA, navigates, and reports loggedIn by fact', async () => {
  const f = fakeBrowser({ finalUrl: 'https://www.linkedin.com/feed/' });
  const restore = createCookieSessionRestorer({ browserProvider: f.browserProvider, connect: f.connect });
  const res = await restore({ cookies, userAgent: 'UA', verifyUrl: 'https://www.linkedin.com/feed/', loggedInWhen: (u) => /\/feed/.test(u) && !/login/.test(u) });
  expect(res).toMatchObject({ sessionId: 'sess-1', loggedIn: true });
  expect(f.calls.setUA).toBe('UA');
  expect(f.calls.cookies).toHaveLength(1);
  expect(f.calls.gotoUrl).toBe('https://www.linkedin.com/feed/');
  expect(f.calls.closed).toBe(true);
});

test('a redirect to login -> loggedIn:false (never faked)', async () => {
  const f = fakeBrowser({ finalUrl: 'https://www.linkedin.com/login' });
  const restore = createCookieSessionRestorer({ browserProvider: f.browserProvider, connect: f.connect });
  const res = await restore({ cookies, verifyUrl: 'https://www.linkedin.com/feed/', loggedInWhen: (u) => /\/feed/.test(u) && !/login/.test(u) });
  expect(res.loggedIn).toBe(false);
});

test('no cookies -> coded seam', async () => {
  const f = fakeBrowser();
  const restore = createCookieSessionRestorer({ browserProvider: f.browserProvider, connect: f.connect });
  await expect(restore({ cookies: [] })).rejects.toMatchObject({ code: 'COOKIE_SESSION_NO_COOKIES' });
});

test('keepOpen leaves the session open (for scraping/actions)', async () => {
  const f = fakeBrowser();
  const restore = createCookieSessionRestorer({ browserProvider: f.browserProvider, connect: f.connect });
  await restore({ cookies, verifyUrl: 'https://x/', keepOpen: true });
  expect(f.calls.closed).toBe(false);
});
