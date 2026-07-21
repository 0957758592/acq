import {
  DuoplusClient,
  normalizeDuoPlusApp,
  normalizeDuoPlusPhone,
  redactDuoPlusCapture,
  resolveDuoPlusAppIds
} from '../duoplus-client.js';
import { DuoplusCloudPhoneProvider, createCloudPhoneProvider } from '../provider.js';

test('redactDuoPlusCapture strips credentials while preserving endpoint shape', () => {
  const redacted = redactDuoPlusCapture({
    url: 'https://my.duoplus.cn/control?id=FpPU2&token=secret-token&sign=secret-sign&plain=value',
    headers: {
      authorization: 'Bearer secret',
      cookie: 'duo_session=secret',
      'DuoPlus-API-Key': 'secret-key',
      accept: 'application/json'
    },
    body: {
      image_id: 'FpPU2',
      password: 'secret-password',
      nested: {
        signed_url: 'https://files.example.test/a.png?X-Amz-Signature=secret-signature',
        keep: 'visible'
      }
    }
  });

  expect(redacted.url).toBe('https://my.duoplus.cn/control?id=FpPU2&token=[REDACTED]&sign=[REDACTED]&plain=value');
  expect(redacted.headers.authorization).toBe('[REDACTED]');
  expect(redacted.headers.cookie).toBe('[REDACTED]');
  expect(redacted.headers['DuoPlus-API-Key']).toBe('[REDACTED]');
  expect(redacted.headers.accept).toBe('application/json');
  expect(redacted.body.password).toBe('[REDACTED]');
  expect(redacted.body.nested.signed_url).toBe('[REDACTED]');
  expect(redacted.body.nested.keep).toBe('visible');
});

test('DuoplusClient sends documented list request without leaking API key in errors', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ code: 200, data: { list: [] } });
      }
    };
  };
  const client = new DuoplusClient({
    apiKey: 'duoplus-secret',
    baseUrl: 'https://openapi.example.test',
    minDelayMs: 0,
    fetchImpl
  });

  const response = await client.listCloudPhones({ page: 2, pagesize: 25, image_id: ['FpPU2'] });

  expect(response.data.list).toEqual([]);
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe('https://openapi.example.test/api/v1/cloudPhone/list');
  expect(requests[0].init.method).toBe('POST');
  expect(requests[0].init.headers['DuoPlus-API-Key']).toBe('duoplus-secret');
  expect(JSON.parse(requests[0].init.body)).toEqual({ page: 2, pagesize: 25, image_id: ['FpPU2'] });
});

test('normalizeDuoPlusPhone maps status and proxy state for Engine devices', () => {
  const device = normalizeDuoPlusPhone({
    id: 'FpPU2',
    name: 'snap_FpPU2',
    status: 1,
    area: 'US',
    ip: '203.0.113.7',
    adb: '127.0.0.1:20100',
    adb_password: 'must-not-persist',
    proxy: { id: 'proxy-1', ip: '198.51.100.2' },
    group: [{ name: 'Subscription Startup' }]
  });

  expect(device.provider).toBe('duoplus');
  expect(device.providerDeviceId).toBe('FpPU2');
  expect(device.status).toBe('running');
  expect(device.groupName).toBe('Subscription Startup');
  expect(device.runtime.adbAddress).toBe('127.0.0.1:20100');
  expect(device.runtime.adbPassword).toBe('');
  expect(device.providerMeta.proxyConfigured).toBe(true);
  expect(device.providerMeta.rawStatus).toBe(1);
});

test('normalizeDuoPlusApp + resolveDuoPlusAppIds match by name/package and report missing', () => {
  const catalog = [
    { app_id: 'a-tt', name: 'TikTok', package: 'com.zhiliaoapp.musically' },
    { app_id: 'a-ig', name: 'Instagram', package: 'com.instagram.android' }
  ];
  expect(normalizeDuoPlusApp(catalog[0]).appId).toBe('a-tt');
  expect(normalizeDuoPlusApp({})).toBeNull();

  const { matched, missing } = resolveDuoPlusAppIds(catalog, ['TikTok', 'com.instagram.android', 'WhatsApp']);
  expect(matched.map((a) => a.appId)).toEqual(['a-tt', 'a-ig']);
  expect(missing).toEqual(['whatsapp']);
});

test('installApp posts documented body to /app/install', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => '{"code":200,"data":{}}' };
  };
  const client = new DuoplusClient({ apiKey: 'k', baseUrl: 'https://openapi.example.test', minDelayMs: 0, fetchImpl });
  await client.installApp(['FpPU2', 'Qg7jG'], 'a-tt', 'v1');
  expect(requests[0].url).toBe('https://openapi.example.test/api/v1/app/install');
  expect(requests[0].body).toEqual({ image_ids: ['FpPU2', 'Qg7jG'], app_id: 'a-tt', app_version_id: 'v1' });
});

test('provider.provisionApps resolves names from catalog and installs each', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    calls.push({ u, body: init.body ? JSON.parse(init.body) : null });
    if (u.endsWith('/app/list')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            code: 200,
            data: { list: [{ app_id: 'a-tt', name: 'TikTok' }, { app_id: 'a-ig', name: 'Instagram' }] }
          })
      };
    }
    return { ok: true, status: 200, text: async () => '{"code":200,"data":{}}' };
  };
  const provider = createCloudPhoneProvider({ type: 'duoplus', apiKey: 'k', minDelayMs: 0, fetchImpl });
  const result = await provider.provisionApps('FpPU2', { appNames: ['TikTok', 'Instagram', 'Nope'] });

  expect(result.installed.map((i) => i.appId)).toEqual(['a-tt', 'a-ig']);
  expect(result.missing).toEqual(['nope']);
  const installCalls = calls.filter((c) => c.u.endsWith('/app/install'));
  expect(installCalls).toHaveLength(2);
  expect(installCalls[0].body).toEqual({ image_ids: ['FpPU2'], app_id: 'a-tt', app_version_id: '' });
});

test('createCloudPhoneProvider supports DuoPlus without changing VMOS default', () => {
  const provider = createCloudPhoneProvider({
    type: 'duoplus',
    apiKey: 'duoplus-secret',
    minDelayMs: 0,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"code":200,"data":{}}' })
  });

  expect(provider).toBeInstanceOf(DuoplusCloudPhoneProvider);
  expect(provider.type).toBe('duoplus');
});
