import { createPuppeteerBrowserProvider } from './puppeteer-browser-provider.js';

function fakePuppeteer() {
  const log = { contexts: [], launched: 0 };
  const page = {
    _ua: null,
    _auth: null,
    _cookies: null,
    goto: async () => {},
    content: async () => '<html>ok</html>',
    evaluate: async (fn) => (typeof fn === 'function' ? fn() : []),
    waitForSelector: async () => {},
    setUserAgent: async function (ua) { this._ua = ua; },
    authenticate: async function (a) { this._auth = a; },
    setCookie: async function (...c) { this._cookies = c; }
  };
  const puppeteer = {
    launch: async (opts) => {
      log.launched += 1;
      log.launchOpts = opts;
      return {
        createBrowserContext: async (opts2) => {
          const ctx = { opts: opts2, closed: false, newPage: async () => page, close: async () => { ctx.closed = true; } };
          log.contexts.push(ctx);
          return ctx;
        },
        close: async () => { log.browserClosed = true; }
      };
    }
  };
  return { puppeteer, log, page };
}

describe('createPuppeteerBrowserProvider', () => {
  it('launches once (lazily) and builds an anti-detect context with proxy/UA/cookies', async () => {
    const { puppeteer, log, page } = fakePuppeteer();
    const provider = createPuppeteerBrowserProvider({ puppeteer, maxConcurrency: 2 });
    const wrapped = await provider.openPage({ proxy: 'http://p:1', userAgent: 'UA', cookies: [{ name: 's', value: '1' }] });
    expect(log.launched).toBe(1);
    expect(log.contexts[0].opts).toMatchObject({ proxyServer: 'http://p:1' });
    expect(page._ua).toBe('UA');
    expect(page._cookies).toEqual([{ name: 's', value: '1' }]);
    await provider.openPage({}); // second open reuses the same browser
    expect(log.launched).toBe(1);
    expect(typeof wrapped.goto).toBe('function');
    expect(typeof wrapped.scrollToBottom).toBe('function');
  });

  it('applies proxy credentials via page.authenticate (proxy-server carries no auth)', async () => {
    const { puppeteer, log, page } = fakePuppeteer();
    const provider = createPuppeteerBrowserProvider({ puppeteer, maxConcurrency: 1 });
    await provider.openPage({ proxy: 'http://user:pass@host:8080' });
    expect(log.contexts[0].opts).toMatchObject({ proxyServer: 'http://host:8080' });
    expect(page._auth).toEqual({ username: 'user', password: 'pass' });
  });

  it('gates concurrency: a 3rd open waits until a page closes (bounded pool)', async () => {
    const { puppeteer } = fakePuppeteer();
    const provider = createPuppeteerBrowserProvider({ puppeteer, maxConcurrency: 1 });
    const p1 = await provider.openPage({});
    let secondOpened = false;
    const p2Promise = provider.openPage({}).then((p) => { secondOpened = true; return p; });
    await Promise.resolve();
    expect(secondOpened).toBe(false); // blocked at capacity
    await p1.close();
    const p2 = await p2Promise;
    expect(secondOpened).toBe(true);
    await p2.close();
  });

  it('closing a page closes its context and frees the slot', async () => {
    const { puppeteer, log } = fakePuppeteer();
    const provider = createPuppeteerBrowserProvider({ puppeteer, maxConcurrency: 1 });
    const wrapped = await provider.openPage({});
    await wrapped.close();
    expect(log.contexts[0].closed).toBe(true);
  });

  it('fails safe with a coded error when the browser engine is unavailable', async () => {
    const provider = createPuppeteerBrowserProvider({ loadEngine: async () => null });
    await expect(provider.openPage({})).rejects.toMatchObject({ code: 'BROWSER_ENGINE_UNAVAILABLE' });
  });

  it('close() shuts the browser down', async () => {
    const { puppeteer, log } = fakePuppeteer();
    const provider = createPuppeteerBrowserProvider({ puppeteer });
    await provider.openPage({});
    await provider.close();
    expect(log.browserClosed).toBe(true);
  });
});
