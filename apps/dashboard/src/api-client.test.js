import { createApiClient } from './api-client.js';

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next.throw) throw new Error('network');
    return {
      ok: next.status < 400,
      status: next.status,
      json: async () => next.body
    };
  };
  impl.calls = calls;
  return impl;
}

describe('createApiClient', () => {
  test('POSTs an operation with bearer auth and returns the envelope data', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: { data: { available: 7 }, error: null, meta: {} } }]);
    const client = createApiClient({ baseUrl: 'http://cp', token: 'tok', fetchImpl });
    const data = await client.execute('pool.status', { platform: 'telegram' });
    expect(data).toEqual({ available: 7 });
    const { url, init } = fetchImpl.calls[0];
    expect(url).toBe('http://cp/v1/op/pool.status');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ platform: 'telegram' });
  });

  test('throws the coded error from an error envelope', async () => {
    const fetchImpl = fakeFetch([{ status: 403, body: { data: null, error: { code: 'FORBIDDEN', message: 'no' }, meta: {} } }]);
    const client = createApiClient({ baseUrl: 'http://cp', token: 't', fetchImpl });
    await expect(client.execute('account.retire', {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('retries a network failure with backoff, then succeeds', async () => {
    const fetchImpl = fakeFetch([
      { throw: true },
      { status: 200, body: { data: { ok: true }, error: null, meta: {} } }
    ]);
    const client = createApiClient({ baseUrl: 'http://cp', token: 't', fetchImpl, retries: 2, sleep: async () => {} });
    await expect(client.execute('reconcile.now', {})).resolves.toEqual({ ok: true });
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test('gives up after exhausting retries', async () => {
    const fetchImpl = fakeFetch([{ throw: true }, { throw: true }, { throw: true }]);
    const client = createApiClient({ baseUrl: 'http://cp', token: 't', fetchImpl, retries: 2, sleep: async () => {} });
    await expect(client.execute('pool.status', {})).rejects.toThrow('network');
  });
});
