import { createApiClient, ApiError } from './client';

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as unknown as Response;
}

test('POSTs to /v1/op/<operation> with a bearer token and returns envelope.data', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ data: { items: [1, 2] }, error: null }));
  const client = createApiClient({ baseUrl: 'http://api', token: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch });
  await expect(client.execute('target.list', { platform: 'tiktok' })).resolves.toEqual({ items: [1, 2] });
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('http://api/v1/op/target.list');
  expect(init.method).toBe('POST');
  expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  expect(init.body).toBe(JSON.stringify({ platform: 'tiktok' }));
});

test('throws a coded ApiError on an error envelope and does NOT retry', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ data: null, error: { code: 'FORBIDDEN', message: 'nope' } }));
  const client = createApiClient({ baseUrl: 'http://api', token: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch, retries: 2 });
  await expect(client.execute('target.add')).rejects.toBeInstanceOf(ApiError);
  await expect(client.execute('target.add')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(fetchImpl).toHaveBeenCalledTimes(2); // once per call above, never retried
});

test('retries a transient network error with backoff, then succeeds', async () => {
  const fetchImpl = jest
    .fn()
    .mockRejectedValueOnce(new Error('network down'))
    .mockResolvedValue(jsonResponse({ data: 'ok', error: null }));
  const client = createApiClient({ baseUrl: 'http://api', token: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch, retries: 2, sleep: async () => {} });
  await expect(client.execute('telemetry.summary')).resolves.toBe('ok');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
