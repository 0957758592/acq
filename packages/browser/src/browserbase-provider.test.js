import { createBrowserbaseProvider } from './browserbase-provider.js';

// A fake fetch records calls and returns scripted responses, so the adapter is
// verified for real (URL, headers, body, parsing) without touching the network.
function fakeFetch(script) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const key = Object.keys(script).find((k) => url.includes(k));
    const res = script[key] ?? { ok: false, status: 404, body: '{}' };
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      text: async () => res.body ?? '{}'
    };
  };
  impl.calls = calls;
  return impl;
}

describe('Browserbase adapter (cloud BrowserProvider backend)', () => {
  it('fails safe with a coded seam when no API key is configured', () => {
    expect(() => createBrowserbaseProvider({})).toThrow(/BROWSERBASE_API_KEY_REQUIRED/);
    try {
      createBrowserbaseProvider({});
    } catch (err) {
      expect(err.code).toBe('BROWSERBASE_API_KEY_REQUIRED');
    }
  });

  it('createSession posts to /v1/sessions with the api key + project, returns {sessionId, cdpUrl}', async () => {
    const fetchImpl = fakeFetch({
      '/v1/sessions': { ok: true, body: JSON.stringify({ id: 'bb-1', connectUrl: 'wss://connect.browserbase.com/bb-1' }) }
    });
    const bb = createBrowserbaseProvider({ apiKey: 'bb-key', projectId: 'proj-9', fetchImpl });
    const session = await bb.createSession({ geo: 'US' });
    expect(session).toEqual({ sessionId: 'bb-1', cdpUrl: 'wss://connect.browserbase.com/bb-1' });
    const { url, init } = fetchImpl.calls[0];
    expect(url).toContain('/v1/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers['x-bb-api-key']).toBe('bb-key');
    const body = JSON.parse(init.body);
    expect(body.projectId).toBe('proj-9');
    // Browserbase rejects unknown top-level keys — `stealth` is NOT one of them
    // (advanced stealth lives under browserSettings). A plain session sends only
    // the valid minimal body.
    expect(body).not.toHaveProperty('stealth');
    expect(body.region).toBe('US');
  });

  it('maps optional stealth/context under browserSettings, never as top-level keys', async () => {
    const fetchImpl = fakeFetch({ '/v1/sessions': { ok: true, body: JSON.stringify({ id: 'bb-2', connectUrl: 'wss://x' }) } });
    const bb = createBrowserbaseProvider({ apiKey: 'k', projectId: 'p', fetchImpl });
    await bb.createSession({ stealth: true, contextId: 'ctx-1' });
    const body = JSON.parse(fetchImpl.calls[0].init.body);
    expect(body).not.toHaveProperty('stealth');
    expect(body.browserSettings.advancedStealth).toBe(true);
    expect(body.browserSettings.context).toMatchObject({ id: 'ctx-1', persist: true });
  });

  it('maps a vendor error to a coded BROWSERBASE_REQUEST_FAILED (never a leaked INTERNAL)', async () => {
    const fetchImpl = fakeFetch({ '/v1/sessions': { ok: false, status: 401, body: 'unauthorized' } });
    const bb = createBrowserbaseProvider({ apiKey: 'bad', projectId: 'p', fetchImpl });
    await expect(bb.createSession({})).rejects.toMatchObject({ code: 'BROWSERBASE_REQUEST_FAILED' });
  });

  it('liveView returns the vendor debugger URL for takeover/inspection', async () => {
    const fetchImpl = fakeFetch({
      '/debug': { ok: true, body: JSON.stringify({ debuggerFullscreenUrl: 'https://browserbase.com/live/bb-1' }) }
    });
    const bb = createBrowserbaseProvider({ apiKey: 'bb-key', projectId: 'p', fetchImpl });
    const url = await bb.liveView('bb-1');
    expect(url).toBe('https://browserbase.com/live/bb-1');
  });
});
