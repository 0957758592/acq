import { createOneSecMailCodeReader } from './onesecmail-code.js';

function fakeFetch(script) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const key = Object.keys(script).find((k) => url.includes(k));
    const res = script[key] ?? { ok: false, status: 404, body: '[]' };
    return { ok: res.ok ?? true, status: res.status ?? 200, text: async () => res.body };
  };
  impl.calls = calls;
  return impl;
}

describe('1secmail API code reader (2nd API-only email type — no IMAP)', () => {
  it('returns empty (no throw) with no address', async () => {
    expect(await createOneSecMailCodeReader({}).fetchLatestCode()).toBe('');
  });

  it('lists messages then reads the latest body and extracts the code', async () => {
    const fetchImpl = fakeFetch({
      'action=getMessages': { body: JSON.stringify([{ id: 88, from: 'shop@x', subject: 'verification', date: '2026-08-03' }]) },
      'action=readMessage': { body: JSON.stringify({ subject: 'verification', textBody: 'Your confirm code is 771820', body: '' }) }
    });
    const reader = createOneSecMailCodeReader({ email: 'abc@1secmail.com', fetchImpl });
    expect(await reader.fetchLatestCode({ limit: 5 })).toBe('771820');
    // login+domain were split from the address into the query
    expect(fetchImpl.calls[0]).toContain('login=abc');
    expect(fetchImpl.calls[0]).toContain('domain=1secmail.com');
  });

  it('maps a vendor failure to a coded ONESECMAIL_REQUEST_FAILED (never a leaked INTERNAL)', async () => {
    const fetchImpl = fakeFetch({ 'action=getMessages': { ok: false, status: 500, body: 'err' } });
    const reader = createOneSecMailCodeReader({ email: 'abc@1secmail.com', fetchImpl });
    await expect(reader.fetchLatestCode()).rejects.toMatchObject({ code: 'ONESECMAIL_REQUEST_FAILED' });
  });
});
