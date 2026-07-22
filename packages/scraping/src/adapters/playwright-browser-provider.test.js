import { createPlaywrightBrowserProvider } from './playwright-browser-provider.js';

function fakeChromium() {
  const log = { contexts: [], launched: 0 };
  const page = {
    goto: async () => {},
    content: async () => '<html>ok</html>',
    evaluate: async (fn) => (typeof fn === 'function' ? fn() : []),
    waitForSelector: async () => {},
    close: async () => {}
  };
  const chromium = {
    launch: async (opts) => {
      log.launched += 1;
      log.launchOpts = opts;
      return {
        newContext: async (opts2) => {
          const ctx = { opts: opts2, cookies: null, closed: false, addCookies: async (c) => { ctx.cookies = c; }, newPage: async () => page, close: async () => { ctx.closed = true; } };
          log.contexts.push(ctx);
          return ctx;
        },
        close: async () => { log.browserClosed = true; }
      };
    }
  };
  return { chromium, log, page };
}

describe('createPlaywrightBrowserProvider', () => {
  it('launches once (lazily) and builds an anti-detect context with proxy/UA/cookies', async () => {
    const { chromium, log } = fakeChromium();
    const provider = createPlaywrightBrowserProvider({ chromium, maxConcurrency: 2 });
    const page = await provider.openPage({ proxy: 'http://p:1', userAgent: 'UA', cookies: [{ name: 's', value: '1' }] });
    expect(log.launched).toBe(1);
    expect(log.contexts[0].opts).toMatchObject({ userAgent: 'UA', proxy: { server: 'http://p:1' } });
    expect(log.contexts[0].cookies).toEqual([{ name: 's', value: '1' }]);
    await provider.openPage({}); // second open reuses the same browser
    expect(log.launched).toBe(1);
    expect(typeof page.goto).toBe('function');
    expect(typeof page.scrollToBottom).toBe('function');
  });

  it('gates concurrency: a 3rd open waits until a page closes (bounded pool)', async () => {
    const { chromium } = fakeChromium();
    const provider = createPlaywrightBrowserProvider({ chromium, maxConcurrency: 1 });
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
    const { chromium, log } = fakeChromium();
    const provider = createPlaywrightBrowserProvider({ chromium, maxConcurrency: 1 });
    const page = await provider.openPage({});
    await page.close();
    expect(log.contexts[0].closed).toBe(true);
  });

  it('fails safe with a coded error when the browser engine is unavailable', async () => {
    const provider = createPlaywrightBrowserProvider({ loadChromium: async () => null });
    await expect(provider.openPage({})).rejects.toMatchObject({ code: 'BROWSER_ENGINE_UNAVAILABLE' });
  });

  it('close() shuts the browser down', async () => {
    const { chromium, log } = fakeChromium();
    const provider = createPlaywrightBrowserProvider({ chromium });
    await provider.openPage({});
    await provider.close();
    expect(log.browserClosed).toBe(true);
  });
});
