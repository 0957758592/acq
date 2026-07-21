import {
  DuoplusInternalClient,
  normalizeCaptures
} from '../duoplus-internal-client.js';

test('constructor requires a session token', () => {
  expect(() => new DuoplusInternalClient({ token: '' })).toThrow(/session token/i);
});

test('request sends Authorization token + JSON to api.duoplus.cn', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => '{"code":200,"data":{"list":[]}}' };
  };
  const client = new DuoplusInternalClient({ token: 'sess-tok', minDelayMs: 0, fetchImpl });
  await client.controlList({ regionTypeId: 'lyPSZ' });
  expect(calls[0].url).toBe('https://api.duoplus.cn/image/controlList');
  expect(calls[0].init.headers.Authorization).toBe('sess-tok');
  expect(calls[0].init.headers.Lang).toBe('en');
  expect(JSON.parse(calls[0].init.body)).toMatchObject({ page: 1, region_type_id: 'lyPSZ', group_id: 'all' });
});

test('batchCapture posts image_ids + quality params', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => '{"code":200,"data":{"captures":[]}}' };
  };
  const client = new DuoplusInternalClient({ token: 't', minDelayMs: 0, fetchImpl });
  await client.batchCapture(['FpPU2', 'Qg7jG'], { width: 320, height: 320, quality: 20 });
  expect(calls[0].url).toBe('https://api.duoplus.cn/image/batchCapture2');
  expect(calls[0].body).toEqual({ image_ids: ['FpPU2', 'Qg7jG'], width: 320, height: 320, quality: 20, supplier_id: 1 });
});

test('captureFrames returns ready-to-render data URLs', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        code: 200,
        data: { captures: [{ image_id: 'FpPU2', status: 3, link_status: 1, capture: 'QUJD', message: '' }] }
      })
  });
  const client = new DuoplusInternalClient({ token: 't', minDelayMs: 0, fetchImpl });
  const frames = await client.captureFrames(['FpPU2']);
  expect(frames).toEqual([
    { imageId: 'FpPU2', status: 3, linkStatus: 1, dataUrl: 'data:image/jpeg;base64,QUJD', message: '' }
  ]);
});

test('normalizeCaptures drops items without image_id and handles empty capture', () => {
  const out = normalizeCaptures({
    data: { captures: [{ image_id: '', capture: 'x' }, { image_id: 'A', capture: '' }] }
  });
  expect(out).toEqual([{ imageId: 'A', status: NaN, linkStatus: NaN, dataUrl: '', message: '' }]);
});

test('throws DUOPLUS_SESSION_EXPIRED on 401', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"code":401,"message":"re-login"}' });
  const client = new DuoplusInternalClient({ token: 't', minDelayMs: 0, fetchImpl });
  await expect(client.controlList()).rejects.toMatchObject({ code: 'DUOPLUS_SESSION_EXPIRED' });
});
