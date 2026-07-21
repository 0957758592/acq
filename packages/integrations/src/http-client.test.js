import { IntegrationHttpClient } from './http-client.js';

function fakeResponse({ ok = true, status = 200, contentType = 'application/json', body = { ok: true } } = {}) {
  return {
    ok,
    status,
    url: 'http://example.test/x',
    headers: { get: () => contentType },
    text: async () => JSON.stringify(body)
  };
}

test('request forwards an abort signal to fetchImpl', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return fakeResponse();
  };
  const client = new IntegrationHttpClient({ baseUrl: 'http://example.test', fetchImpl });
  const signal = AbortSignal.timeout(1000);

  await client.request('/thing', { signal });

  expect(calls).toHaveLength(1);
  expect(calls[0].options.signal).toBe(signal);
});

test('request omits signal (undefined) when none provided — backward compatible', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return fakeResponse();
  };
  const client = new IntegrationHttpClient({ baseUrl: 'http://example.test', fetchImpl });

  await client.request('/thing');

  expect(calls[0].options.signal).toBeUndefined();
});

test('request builds url, sets JSON headers and merges custom headers', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return fakeResponse();
  };
  const client = new IntegrationHttpClient({
    baseUrl: 'http://example.test/',
    headers: { Authorization: 'Bearer k' },
    fetchImpl
  });

  const data = await client.request('/orders', { method: 'POST', body: { a: 1 }, headers: { 'X-Extra': '1' } });

  expect(data).toEqual({ ok: true });
  expect(calls[0].url).toBe('http://example.test/orders');
  expect(calls[0].options.method).toBe('POST');
  expect(calls[0].options.body).toBe(JSON.stringify({ a: 1 }));
  expect(calls[0].options.headers).toMatchObject({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: 'Bearer k',
    'X-Extra': '1'
  });
});
