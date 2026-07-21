import { GeeLarkClient, geeLarkSign } from '../geelark-client.js';
import { DeviceControlError } from '../errors.js';

// Known vector: SHA256('app1'+'trace-123456'+'1700000000000'+'trace-'+'secret') uppercased.
const KNOWN_SIGN = '81B5A02D176E64B5B99F1289A25BD07D1B04E2D2E736B8589ED661FB15D2B7EE';

function fakeFetch(payload = { code: 0, msg: 'ok', data: {} }, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok, status, text: async () => JSON.stringify(payload) };
  };
  return { fetchImpl, calls };
}

function makeClient(fetchImpl, overrides = {}) {
  return new GeeLarkClient({
    appId: 'app1',
    apiKey: 'secret',
    fetchImpl,
    now: () => 1_700_000_000_000,
    genTraceId: () => 'trace-123456',
    ...overrides
  });
}

describe('geeLarkSign', () => {
  test('matches the documented SHA256(appId+traceId+ts+nonce+apiKey) upper-hex', () => {
    expect(
      geeLarkSign({ appId: 'app1', traceId: 'trace-123456', ts: '1700000000000', nonce: 'trace-', apiKey: 'secret' })
    ).toBe(KNOWN_SIGN);
  });
});

describe('GeeLarkClient config', () => {
  test('throws GEELARK_CONFIG when credentials are missing', () => {
    try {
      new GeeLarkClient({ appId: '', apiKey: '', fetchImpl: async () => ({}) });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DeviceControlError);
      expect(err.code).toBe('GEELARK_CONFIG');
    }
  });
});

describe('GeeLarkClient.request', () => {
  test('signs with appId/traceId/ts/nonce headers and posts to baseUrl+path', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const client = makeClient(fetchImpl);

    await client.request('POST', '/phone/list', { page: 1 });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe('https://openapi.geelark.com/open/v1/phone/list');
    expect(init.headers.appId).toBe('app1');
    expect(init.headers.traceId).toBe('trace-123456');
    expect(init.headers.ts).toBe('1700000000000');
    expect(init.headers.nonce).toBe('trace-'); // first 6 chars of traceId
    expect(init.headers.sign).toBe(KNOWN_SIGN);
    expect(JSON.parse(init.body)).toEqual({ page: 1 });
  });

  test('throws GEELARK_REQUEST_FAILED on a non-success envelope code', async () => {
    const { fetchImpl } = fakeFetch({ code: 40001, msg: 'bad', data: null });
    const client = makeClient(fetchImpl);

    await expect(client.request('POST', '/phone/list', {})).rejects.toMatchObject({
      code: 'GEELARK_REQUEST_FAILED'
    });
  });
});

describe('GeeLarkClient device endpoints', () => {
  test('startDevice posts /phone/start with ids', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await makeClient(fetchImpl).startDevice('env-9');
    expect(calls[0].url).toContain('/phone/start');
    expect(JSON.parse(calls[0].init.body)).toEqual({ ids: ['env-9'] });
  });

  test('stopDevice posts /envir/stop with envirId', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await makeClient(fetchImpl).stopDevice('env-9');
    expect(calls[0].url).toContain('/envir/stop');
    expect(JSON.parse(calls[0].init.body)).toEqual({ envirId: 'env-9' });
  });

  test('installApp posts /app/install with EnvId + AppVersionId', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await makeClient(fetchImpl).installApp('env-9', 'appver-1');
    expect(calls[0].url).toContain('/app/install');
    expect(JSON.parse(calls[0].init.body)).toEqual({ EnvId: 'env-9', AppVersionId: 'appver-1' });
  });
});
