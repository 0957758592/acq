import { parseCliArgs, runCli, runCliHttp } from './cli.js';

const facade = {
  async execute(operation, { role, args }) {
    if (operation === 'boom') return { data: null, error: { code: 'FORBIDDEN', message: 'no' }, meta: { operation } };
    return { data: { operation, role, args }, error: null, meta: { operation } };
  }
};

describe('parseCliArgs', () => {
  test('reads the operation and --key=value args (JSON-typed)', () => {
    const { operation, args } = parseCliArgs(['pool.status', '--platform=telegram', '--count=5', '--auto=true']);
    expect(operation).toBe('pool.status');
    expect(args).toEqual({ platform: 'telegram', count: 5, auto: true });
  });

  test('supports bare key=value too', () => {
    expect(parseCliArgs(['account.status', 'accountId=a1']).args).toEqual({ accountId: 'a1' });
  });
});

describe('runCli', () => {
  test('executes and returns code 0 with JSON output on success', async () => {
    const res = await runCli(['pool.status', '--platform=telegram'], { facade, role: 'operator' });
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).data).toMatchObject({ operation: 'pool.status', role: 'operator' });
  });

  test('returns a non-zero code and the error on failure', async () => {
    const res = await runCli(['boom'], { facade, role: 'readonly' });
    expect(res.code).toBe(1);
    expect(JSON.parse(res.stderr).code).toBe('FORBIDDEN');
  });

  test('errors when no operation is given', async () => {
    const res = await runCli([], { facade, role: 'admin' });
    expect(res.code).toBe(2);
  });
});

describe('runCliHttp — real CLI against the LIVE server (same facade over REST)', () => {
  function fakeFetch(script) {
    const calls = [];
    const impl = async (url, init = {}) => {
      calls.push({ url, init });
      const r = script(url, init);
      return { ok: r.ok ?? true, status: r.status ?? 200, text: async () => r.body };
    };
    impl.calls = calls;
    return impl;
  }

  test('POSTs /v1/op/:operation with the bearer token + args, prints the envelope (get)', async () => {
    const fetchImpl = fakeFetch(() => ({ body: JSON.stringify({ data: { available: 7 }, error: null, meta: {} }) }));
    const res = await runCliHttp(['pool.status', 'platform=telegram'], { baseUrl: 'http://h:7500', token: 'tok', fetchImpl });
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).data).toEqual({ available: 7 });
    const { url, init } = fetchImpl.calls[0];
    expect(url).toBe('http://h:7500/v1/op/pool.status');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ platform: 'telegram' });
  });

  test('a coded error envelope becomes a non-zero exit + the error on stderr (set)', async () => {
    const fetchImpl = fakeFetch(() => ({ body: JSON.stringify({ data: null, error: { code: 'FORBIDDEN', message: 'no' }, meta: {} }) }));
    const res = await runCliHttp(['account.retire', 'accountId=a1'], { baseUrl: 'http://h:7500', token: 't', fetchImpl });
    expect(res.code).toBe(1);
    expect(JSON.parse(res.stderr).code).toBe('FORBIDDEN');
  });

  test('a non-JSON / transport failure is a coded CLI error, never a crash', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 502, body: '<html>bad gateway' }));
    const res = await runCliHttp(['pool.status'], { baseUrl: 'http://h:7500', token: 't', fetchImpl });
    expect(res.code).toBe(1);
    expect(JSON.parse(res.stderr).code).toBe('CLI_REQUEST_FAILED');
  });

  test('errors when no operation is given', async () => {
    const res = await runCliHttp([], { baseUrl: 'http://h:7500', token: 't', fetchImpl: fakeFetch(() => ({ body: '{}' })) });
    expect(res.code).toBe(2);
  });
});
