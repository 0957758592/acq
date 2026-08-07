import { browserLoginFromCookies } from './browser-login.js';

const COOKIES_RAW = 'user@x|Mozilla/5.0|[{"name":"li_at","value":"X","domain":".linkedin.com","path":"/"}]';

function ctxWith({ account, restore } = {}) {
  return {
    accountRepo: { find: async () => [account].filter(Boolean) },
    credentialVault: { resolve: async (r) => (r === 'vault:ck' ? COOKIES_RAW : r) },
    cookieSessionRestore: restore
  };
}
const linkedinCookieAccount = { _id: 'a1', platform: 'linkedin', secretRefs: { cookies: 'vault:ck' } };

test('restores the browser session from vaulted cookies and reports loggedIn', async () => {
  let passed;
  const ctx = ctxWith({ account: linkedinCookieAccount, restore: async (args) => { passed = args; return { sessionId: 's1', url: 'https://www.linkedin.com/feed/', loggedIn: true }; } });
  const res = await browserLoginFromCookies(ctx, { accountId: 'a1' });
  expect(res).toMatchObject({ accountId: 'a1', platform: 'linkedin', loggedIn: true, sessionId: 's1', cookieCount: 1 });
  expect(passed.cookies[0]).toMatchObject({ name: 'li_at' });
  expect(passed.userAgent).toBe('Mozilla/5.0');
  expect(passed.verifyUrl).toBe('https://www.linkedin.com/feed/');
});

test('an account without vaulted cookies -> coded seam', async () => {
  const ctx = ctxWith({ account: { _id: 'a2', platform: 'linkedin', secretRefs: {} }, restore: async () => ({}) });
  await expect(browserLoginFromCookies(ctx, { accountId: 'a2' })).rejects.toMatchObject({ code: 'NO_COOKIES' });
});

test('no restorer wired -> coded seam', async () => {
  const ctx = { accountRepo: { find: async () => [linkedinCookieAccount] }, credentialVault: { resolve: async () => COOKIES_RAW } };
  await expect(browserLoginFromCookies(ctx, { accountId: 'a1' })).rejects.toMatchObject({ code: 'BROWSER_LOGIN_UNAVAILABLE' });
});

test('requires accountId; unknown account -> coded seam', async () => {
  await expect(browserLoginFromCookies(ctxWith({}), {})).rejects.toMatchObject({ code: 'ACCOUNT_ID_REQUIRED' });
  const ctx = ctxWith({ account: null, restore: async () => ({}) });
  await expect(browserLoginFromCookies(ctx, { accountId: 'x' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
});
