import { DarkShoppingClient, createDarkShoppingClient } from './dark-shopping-client.js';

function makeFetch() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      url,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ ok: true })
    };
  };
  return { calls, fetchImpl };
}

function makeClient(fetchImpl, overrides = {}) {
  const client = new DarkShoppingClient({ apiKey: 'secret-key', ...overrides });
  // Inject the fake fetch into the underlying http client.
  client.http.fetchImpl = fetchImpl;
  return client;
}

test('constructor throws without an api key', () => {
  expect(() => new DarkShoppingClient()).toThrow('Dark.shopping API key is required');
  expect(() => new DarkShoppingClient({})).toThrow('Dark.shopping API key is required');
});

test('createDarkShoppingClient returns a DarkShoppingClient instance', () => {
  const client = createDarkShoppingClient({ apiKey: 'secret-key' });
  expect(client).toBeInstanceOf(DarkShoppingClient);
});

test('getBalance GETs the balance path with auth header and an abort signal', async () => {
  const { calls, fetchImpl } = makeFetch();
  const client = makeClient(fetchImpl);

  const data = await client.getBalance();

  expect(data).toEqual({ ok: true });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toMatch(/\/balance$/);
  expect(calls[0].options.method).toBe('GET');
  expect(calls[0].options.headers.Authorization).toBe('Bearer secret-key');
  expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
});

test('listOffers GETs the offers path', async () => {
  const { calls, fetchImpl } = makeFetch();
  const client = makeClient(fetchImpl);

  await client.listOffers();

  expect(calls[0].url).toMatch(/\/offers$/);
  expect(calls[0].options.method).toBe('GET');
});

test('purchase POSTs the orders path with a quantity body', async () => {
  const { calls, fetchImpl } = makeFetch();
  const client = makeClient(fetchImpl);

  await client.purchase(3);

  expect(calls[0].url).toMatch(/\/orders$/);
  expect(calls[0].options.method).toBe('POST');
  expect(calls[0].options.body).toBe(JSON.stringify({ quantity: 3 }));
});

test('getOrder GETs the specific order path', async () => {
  const { calls, fetchImpl } = makeFetch();
  const client = makeClient(fetchImpl);

  await client.getOrder('o1');

  expect(calls[0].url).toMatch(/\/orders\/o1$/);
  expect(calls[0].options.method).toBe('GET');
});

test('fetchDelivered hits the delivery path for the order', async () => {
  const { calls, fetchImpl } = makeFetch();
  const client = makeClient(fetchImpl);

  await client.fetchDelivered({ orderId: 'o1' });

  expect(calls[0].url).toMatch(/\/orders\/o1\/delivery$/);
  expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
});
