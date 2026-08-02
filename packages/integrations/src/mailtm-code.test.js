import { createMailTmCodeReader } from './mailtm-code.js';

// Fake fetch scripts the Mail.tm REST API (token → messages → message body) so
// the reader is verified for real (auth, listing, body read, code extraction)
// without the network.
function fakeFetch(script) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const key = Object.keys(script).find((k) => url.includes(k));
    const res = script[key] ?? { ok: false, status: 404, body: '{}' };
    return { ok: res.ok ?? true, status: res.status ?? 200, text: async () => res.body ?? '{}' };
  };
  impl.calls = calls;
  return impl;
}

describe('Mail.tm API code reader (API-only email type — no IMAP)', () => {
  it('returns empty (no throw) when credentials are absent', async () => {
    const reader = createMailTmCodeReader({});
    expect(await reader.fetchLatestCode()).toBe('');
  });

  it('authenticates, lists messages, reads the latest body and extracts the code', async () => {
    const fetchImpl = fakeFetch({
      '/token': { ok: true, body: JSON.stringify({ token: 'jwt-1' }) },
      '/messages/m1': { ok: true, body: JSON.stringify({ subject: 'Your verification code', text: 'Confirm code: 903124', intro: '' }) },
      '/messages': { ok: true, body: JSON.stringify({ 'hydra:member': [{ id: 'm1', subject: 'Your verification code', intro: 'Confirm code 903124' }] }) }
    });
    const reader = createMailTmCodeReader({ email: 'x@mail.tm', password: 'pw', fetchImpl });
    const code = await reader.fetchLatestCode({ limit: 5 });
    expect(code).toBe('903124');
    // token call carried the address+password
    const tokenCall = fetchImpl.calls.find((c) => c.url.includes('/token'));
    expect(JSON.parse(tokenCall.init.body)).toMatchObject({ address: 'x@mail.tm', password: 'pw' });
    // message listing was authorized with the bearer token
    const listCall = fetchImpl.calls.find((c) => c.url.endsWith('/messages') || c.url.includes('/messages?'));
    expect(listCall.init.headers.Authorization || listCall.init.headers.authorization).toContain('jwt-1');
  });

  it('maps an auth failure to a coded MAILTM_AUTH_FAILED (never a leaked INTERNAL)', async () => {
    const fetchImpl = fakeFetch({ '/token': { ok: false, status: 401, body: 'nope' } });
    const reader = createMailTmCodeReader({ email: 'x@mail.tm', password: 'bad', fetchImpl });
    await expect(reader.fetchLatestCode()).rejects.toMatchObject({ code: 'MAILTM_AUTH_FAILED' });
  });
});
