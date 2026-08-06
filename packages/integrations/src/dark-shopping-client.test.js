import { DarkShoppingClient, createDarkShoppingClient } from './dark-shopping-client.js';

// Real dark.shopping API (https://dark.shopping/developer, keystore-api engine):
//   - auth is the `key` QUERY param (not an Authorization header)
//   - every response is HTTP 200 with `{ success, data }`; success:false is an error
//   - product/list is the SEARCH (name/filters); order/create buys by product id;
//     order/download returns a link to a .txt delivery file.
function makeFetch(bodyFor = { success: true, data: {} }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const body = typeof bodyFor === 'function' ? bodyFor(url) : bodyFor;
    return {
      ok: true,
      status: 200,
      url,
      headers: { get: () => 'application/json' },
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    };
  };
  return { calls, fetchImpl };
}

function makeClient(fetchImpl, overrides = {}) {
  const client = new DarkShoppingClient({ apiKey: 'secret-key', ...overrides });
  client.http.fetchImpl = fetchImpl;
  return client;
}

test('constructor throws without an api key', () => {
  expect(() => new DarkShoppingClient()).toThrow('Dark.shopping API key is required');
  expect(() => new DarkShoppingClient({})).toThrow('Dark.shopping API key is required');
});

test('createDarkShoppingClient returns a DarkShoppingClient instance', () => {
  expect(createDarkShoppingClient({ apiKey: 'secret-key' })).toBeInstanceOf(DarkShoppingClient);
});

test('getBalance GETs /user/balance with the key query param, unwraps data, sends abort signal', async () => {
  const { calls, fetchImpl } = makeFetch({ success: true, data: { balance: '991.2500', currency: 'RUB' } });
  const client = makeClient(fetchImpl);

  const data = await client.getBalance();

  expect(data).toEqual({ balance: '991.2500', currency: 'RUB' });
  expect(calls[0].url).toMatch(/\/user\/balance\?/);
  expect(calls[0].url).toContain('key=secret-key');
  expect(calls[0].options.method).toBe('GET');
  expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
});

test('listProducts GETs /product/list with key + flat search params and returns data.items', async () => {
  const items = [{ id: 166920, name: 'LinkedIn USA', price: 1703.75, quantity: 1, minimum_order: 1 }];
  const { calls, fetchImpl } = makeFetch({ success: true, data: { items } });
  const client = makeClient(fetchImpl);

  const result = await client.listProducts({ name: 'linkedin', only_in_stock: 1, price_to: 2000 });

  expect(result).toEqual(items);
  expect(calls[0].url).toMatch(/\/product\/list\?/);
  expect(calls[0].url).toContain('key=secret-key');
  expect(calls[0].url).toContain('name=linkedin');
  expect(calls[0].url).toContain('only_in_stock=1');
  expect(calls[0].url).toContain('price_to=2000');
});

test('listProducts encodes ids[] array params', async () => {
  const { calls, fetchImpl } = makeFetch({ success: true, data: { items: [] } });
  const client = makeClient(fetchImpl);

  await client.listProducts({ ids: [14879, 67989] });

  expect(calls[0].url).toContain('ids%5B%5D=14879');
  expect(calls[0].url).toContain('ids%5B%5D=67989');
});

test('getProduct GETs /product/view with id + key', async () => {
  const { calls, fetchImpl } = makeFetch({ success: true, data: { id: 5, name: 'x' } });
  const client = makeClient(fetchImpl);

  await client.getProduct(5);

  expect(calls[0].url).toMatch(/\/product\/view\?/);
  expect(calls[0].url).toContain('id=5');
  expect(calls[0].url).toContain('key=secret-key');
});

test('createOrder GETs /order/create with product, quantity, idempotence_id and returns data', async () => {
  const { calls, fetchImpl } = makeFetch({
    success: true,
    data: { status: 'ok', id: 1458, link: 'https://dark.shopping/storage/abc.txt' }
  });
  const client = makeClient(fetchImpl);

  const data = await client.createOrder({ product: 1542, quantity: 2, idempotenceId: 'idem-1' });

  expect(data).toEqual({ status: 'ok', id: 1458, link: 'https://dark.shopping/storage/abc.txt' });
  expect(calls[0].url).toMatch(/\/order\/create\?/);
  expect(calls[0].url).toContain('product=1542');
  expect(calls[0].url).toContain('quantity=2');
  expect(calls[0].url).toContain('idempotence_id=idem-1');
  expect(calls[0].url).toContain('key=secret-key');
});

test('getOrderStatus GETs /order/status with id + key', async () => {
  const { calls, fetchImpl } = makeFetch({ success: true, data: { status: 'completed' } });
  const client = makeClient(fetchImpl);

  const data = await client.getOrderStatus(123);

  expect(data).toEqual({ status: 'completed' });
  expect(calls[0].url).toMatch(/\/order\/status\?/);
  expect(calls[0].url).toContain('id=123');
});

test('getOrderDownload GETs /order/download with id + key and returns the link object', async () => {
  const { calls, fetchImpl } = makeFetch({ success: true, data: { link: 'https://dark.shopping/storage/x.txt' } });
  const client = makeClient(fetchImpl);

  const data = await client.getOrderDownload(12);

  expect(data).toEqual({ link: 'https://dark.shopping/storage/x.txt' });
  expect(calls[0].url).toMatch(/\/order\/download\?/);
  expect(calls[0].url).toContain('id=12');
});

test('a success:false envelope throws a coded error carrying status and message', async () => {
  const { fetchImpl } = makeFetch({
    success: false,
    data: { name: 'Not found', message: 'Товар не найден.', code: 0, status: 404 }
  });
  const client = makeClient(fetchImpl);

  await expect(client.createOrder({ product: 9, quantity: 1 })).rejects.toMatchObject({
    code: 'DARKSHOP_API_ERROR',
    status: 404
  });
});

test('fetchDelivered raw-fetches the delivery .txt link (bypasses the JSON client)', async () => {
  const { calls, fetchImpl } = makeFetch('login:pass:email\nlogin2:pass2:email2');
  const client = makeClient(fetchImpl);

  const text = await client.fetchDelivered('https://dark.shopping/storage/abc.txt');

  expect(text).toBe('login:pass:email\nlogin2:pass2:email2');
  expect(calls[0].url).toBe('https://dark.shopping/storage/abc.txt');
});
