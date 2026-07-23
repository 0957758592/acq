import { createBrowserProvider } from './browser-provider.js';

function fakeEngine() {
  const log = { contexts: [], launched: 0, closed: false };
  const makePage = () => ({
    url: () => 'https://x/list',
    goto: async () => {},
    evaluate: async (fn) => (typeof fn === 'function' ? fn() : []),
    title: async () => 't'
  });
  const chromium = {
    launch: async (opts) => {
      log.launched += 1;
      log.launchOpts = opts;
      return {
        newContext: async (o) => {
          const ctx = { opts: o, closed: false, pages: [], newPage: async () => { const p = makePage(); ctx.pages.push(p); return p; }, close: async () => { ctx.closed = true; }, tracing: { start: async () => {}, stop: async () => {} }, newCDPSession: async () => ({ send: async () => ({ targetInfo: { targetId: 'TID-1' } }) }) };
          log.contexts.push(ctx);
          return ctx;
        },
        close: async () => { log.closed = true; }
      };
    }
  };
  const fetchImpl = async (_url) => ({
    ok: true,
    json: async () => [{ id: 'TID-1', url: 'https://x/list', devtoolsFrontendUrl: '/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/TID-1', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/TID-1' }]
  });
  return { chromium, fetchImpl, log };
}

describe('createBrowserProvider (real session-based, Playwright)', () => {
  it('createSession opens an anti-detect context and returns a session id, gated by the pool', async () => {
    const { chromium, log } = fakeEngine();
    const provider = createBrowserProvider({ chromium, maxConcurrent: 1 });
    const s = await provider.createSession({ proxy: 'http://p:1', userAgent: 'UA' });
    expect(s.sessionId).toBeTruthy();
    expect(log.contexts[0].opts).toMatchObject({ userAgent: 'UA', proxy: { server: 'http://p:1' } });
    await expect(provider.createSession({})).rejects.toMatchObject({ code: 'BROWSER_POOL_EXHAUSTED' });
    await provider.shutdown();
  });

  it('extract navigates, evaluates, and validates the result against a schema', async () => {
    const { chromium } = fakeEngine();
    const provider = createBrowserProvider({ chromium, maxConcurrent: 2 });
    const { sessionId } = await provider.createSession({});
    const schema = { validate: async (v) => { if (!Array.isArray(v)) throw new Error('bad'); return v; } };
    const out = await provider.extract(sessionId, { url: 'https://x/list', pageFunction: () => [{ h: '@a' }], schema });
    expect(out).toEqual([{ h: '@a' }]);
    await provider.shutdown();
  });

  it('extract throws EXTRACTION_SCHEMA_MISMATCH when the result fails the schema', async () => {
    const { chromium } = fakeEngine();
    const provider = createBrowserProvider({ chromium, maxConcurrent: 1 });
    const { sessionId } = await provider.createSession({});
    const schema = { validate: async () => { throw new Error('shape mismatch'); } };
    await expect(provider.extract(sessionId, { url: 'https://x', pageFunction: () => ({}), schema }))
      .rejects.toMatchObject({ code: 'EXTRACTION_SCHEMA_MISMATCH' });
    await provider.shutdown();
  });

  it('liveView returns a real devtools frontend URL for the session page', async () => {
    const { chromium, fetchImpl } = fakeEngine();
    const provider = createBrowserProvider({ chromium, fetchImpl, debugPort: 9222, maxConcurrent: 1 });
    const { sessionId } = await provider.createSession({});
    const view = await provider.liveView(sessionId);
    expect(view.devtoolsUrl).toContain('TID-1');
    expect(view.wsUrl).toContain('TID-1');
    await provider.shutdown();
  });

  it('close releases the pool slot so a new session can be created', async () => {
    const { chromium, log } = fakeEngine();
    const provider = createBrowserProvider({ chromium, maxConcurrent: 1 });
    const { sessionId } = await provider.createSession({});
    await provider.close(sessionId);
    expect(log.contexts[0].closed).toBe(true);
    await expect(provider.createSession({})).resolves.toHaveProperty('sessionId'); // slot freed
    await provider.shutdown();
  });

  it('operations on an unknown session fail safe (coded)', async () => {
    const { chromium } = fakeEngine();
    const provider = createBrowserProvider({ chromium });
    await expect(provider.liveView('nope')).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
    await provider.shutdown();
  });

  it('fails safe with a coded error when the engine is unavailable', async () => {
    const provider = createBrowserProvider({ loadChromium: async () => null });
    await expect(provider.createSession({})).rejects.toMatchObject({ code: 'BROWSER_ENGINE_UNAVAILABLE' });
  });
});
