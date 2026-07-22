import { createShopHttpClient } from './shop-http-client.js';

function fakeFetch(capture) {
  return async (url, init) => {
    capture.url = url;
    capture.init = init;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ ok: true })
    };
  };
}

const secretResolver = { resolve: async (ref) => (ref === 'env:KEY' ? 'SECRET123' : ref) };

describe('createShopHttpClient (auth-aware, request-by-object)', () => {
  it('applies api-key auth in a header, resolving the secret ref', async () => {
    const cap = {};
    const client = createShopHttpClient({ fetchImpl: fakeFetch(cap), secretResolver });
    const res = await client.request({
      method: 'POST',
      url: 'https://shop.example/api/buy',
      auth: { kind: 'api-key', config: { in: 'header', name: 'X-Api-Key', valueRef: 'env:KEY' } },
      body: { quantity: 2 }
    });
    expect(res).toEqual({ ok: true });
    expect(cap.init.headers['X-Api-Key']).toBe('SECRET123');
    expect(cap.init.method).toBe('POST');
    expect(JSON.parse(cap.init.body)).toEqual({ quantity: 2 });
  });

  it('applies api-key auth in the query string', async () => {
    const cap = {};
    const client = createShopHttpClient({ fetchImpl: fakeFetch(cap), secretResolver });
    await client.request({
      method: 'GET',
      url: 'https://shop.example/api/balance',
      auth: { kind: 'api-key', config: { in: 'query', name: 'key', valueRef: 'env:KEY' } }
    });
    expect(cap.url).toBe('https://shop.example/api/balance?key=SECRET123');
  });

  it('applies bearer / oauth2 tokens as Authorization: Bearer', async () => {
    const cap = {};
    const client = createShopHttpClient({ fetchImpl: fakeFetch(cap), secretResolver });
    await client.request({ method: 'GET', url: 'https://s/x', auth: { kind: 'bearer', config: { tokenRef: 'env:KEY' } } });
    expect(cap.init.headers.Authorization).toBe('Bearer SECRET123');
  });

  it('applies cookie-session as a Cookie header', async () => {
    const cap = {};
    const client = createShopHttpClient({ fetchImpl: fakeFetch(cap), secretResolver });
    await client.request({ method: 'GET', url: 'https://s/x', auth: { kind: 'cookie-session', config: { cookieRef: 'env:KEY' } } });
    expect(cap.init.headers.Cookie).toBe('SECRET123');
  });

  it('fails safe (coded) on a non-ok HTTP response — never fabricates a body', async () => {
    const client = createShopHttpClient({
      fetchImpl: async () => ({ ok: false, status: 402, headers: { get: () => 'application/json' }, text: async () => '{"message":"insufficient funds"}' }),
      secretResolver
    });
    await expect(client.request({ method: 'GET', url: 'https://s/x', auth: { kind: 'api-key', config: { in: 'header', name: 'K', valueRef: 'env:KEY' } } }))
      .rejects.toMatchObject({ code: 'SHOP_HTTP_ERROR', status: 402 });
  });

  it('login-password without a session is an honest seam (never guessed)', async () => {
    const client = createShopHttpClient({ fetchImpl: fakeFetch({}), secretResolver });
    await expect(client.request({ method: 'GET', url: 'https://s/x', auth: { kind: 'login-password', config: {} } }))
      .rejects.toMatchObject({ code: 'SHOP_AUTH_LOGIN_UNSUPPORTED' });
  });
});
