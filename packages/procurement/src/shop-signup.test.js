import { createShopSignup } from './shop-signup.js';

// A shop spec that declares a signup + confirm flow (verify-by-fact: the exact
// endpoints/fields are per shop — injected here).
function shopWithSignup(overrides = {}) {
  return {
    shopId: 'shop1',
    baseUrl: 'https://shop1.example',
    spec: {
      shopId: 'shop1',
      baseUrl: 'https://shop1.example',
      signup: {
        register: { method: 'POST', path: '/register', fieldMap: { email: 'email', password: 'password', username: 'user' } },
        confirm: { method: 'POST', path: '/confirm', fieldMap: { code: 'code', email: 'email' } },
        cookieTtlMs: 3600000
      },
      ...overrides
    }
  };
}

// Secret refs → values (never plaintext through the API).
const secretResolver = { async resolve(ref) { return ({ 'vault:mail': 'user@gmail.com', 'vault:pw': 'S3cret!', 'vault:imap': 'app-pass', 'vault:user': 'buyer1' })[ref] ?? ref; } };

function fakeHttp(byPath) {
  const calls = [];
  return { calls, async request({ method, url, body }) { const path = new URL(url).pathname; calls.push({ method, path, body }); return typeof byPath[path] === 'function' ? byPath[path](body) : byPath[path]; } };
}

describe('createShopSignup', () => {
  it('registers at a shop using resolved (not plaintext) credentials, mapping fields per the spec', async () => {
    const httpClient = fakeHttp({ '/register': { ok: true } });
    const signup = createShopSignup({ shopRegistry: { get: async () => shopWithSignup() }, httpClient, secretResolver, cookieSessionStore: { put: async () => {} } });
    const res = await signup.signup('shop1', { emailRef: 'vault:mail', passwordRef: 'vault:pw', usernameRef: 'vault:user' });
    expect(res).toMatchObject({ shopId: 'shop1', email: 'user@gmail.com', pending: true });
    // fields mapped per fieldMap, resolved values (never the refs)
    expect(httpClient.calls[0]).toMatchObject({ path: '/register', body: { email: 'user@gmail.com', password: 'S3cret!', user: 'buyer1' } });
  });

  it('is an honest seam when the shop has no signup flow configured', async () => {
    const signup = createShopSignup({ shopRegistry: { get: async () => ({ shopId: 's', spec: {} }) }, httpClient: fakeHttp({}), secretResolver });
    await expect(signup.signup('s', { emailRef: 'vault:mail', passwordRef: 'vault:pw' })).rejects.toMatchObject({ code: 'SHOP_SIGNUP_UNCONFIGURED' });
  });

  it('confirms registration: reads the code from the Gmail inbox (IMAP), submits it, stores the resulting session', async () => {
    const stored = [];
    const httpClient = fakeHttp({ '/confirm': { ok: true, cookies: [{ name: 'sid', value: 'abc' }] } });
    const signup = createShopSignup({
      shopRegistry: { get: async () => shopWithSignup() },
      httpClient,
      secretResolver,
      emailCodeFetcherFactory: ({ email, password }) => ({ fetchLatestCode: async () => (email === 'user@gmail.com' && password === 'app-pass' ? '482913' : '') }),
      cookieSessionStore: { put: async (shopId, cookies, opts) => stored.push({ shopId, cookies, opts }) },
      clock: { now: () => new Date('2026-07-24T00:00:00Z') }
    });
    const res = await signup.confirm('shop1', { emailRef: 'vault:mail', imapPasswordRef: 'vault:imap' });
    expect(res).toMatchObject({ shopId: 'shop1', confirmed: true, cookieRef: 'cookie:shop1' });
    expect(httpClient.calls[0]).toMatchObject({ path: '/confirm', body: { code: '482913', email: 'user@gmail.com' } });
    expect(stored[0]).toMatchObject({ shopId: 'shop1', cookies: [{ name: 'sid', value: 'abc' }] });
  });

  it('returns a coded pending seam when the confirmation code has not arrived yet', async () => {
    const signup = createShopSignup({
      shopRegistry: { get: async () => shopWithSignup() },
      httpClient: fakeHttp({}),
      secretResolver,
      emailCodeFetcherFactory: () => ({ fetchLatestCode: async () => '' }),
      cookieSessionStore: { put: async () => {} }
    });
    await expect(signup.confirm('shop1', { emailRef: 'vault:mail', imapPasswordRef: 'vault:imap' })).rejects.toMatchObject({ code: 'SHOP_SIGNUP_CODE_PENDING' });
  });
});
