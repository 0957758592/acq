import { createBrowserScrapeAdapter } from './browser-scrape-adapter.js';

// A fake page mirroring the BrowserPage port. `batches` are returned by
// successive evaluate() calls (simulating new rows appearing after each scroll).
function fakePage({ content = '<html>ok</html>', batches = [] } = {}) {
  let i = 0;
  const events = [];
  return {
    events,
    goto: async (url) => events.push(['goto', url]),
    waitForSelector: async (sel) => events.push(['wait', sel]),
    content: async () => content,
    evaluate: async () => {
      const batch = batches[i] ?? [];
      i += 1;
      return batch;
    },
    scrollToBottom: async () => events.push(['scroll']),
    close: async () => events.push(['close'])
  };
}

function providerReturning(page) {
  return { openPage: async (opts) => { page.opened = opts; return page; } };
}

const extractItems = () => [];

describe('createBrowserScrapeAdapter (primary tier)', () => {
  it('navigates, scrolls until dry, dedups items and always closes the page', async () => {
    const page = fakePage({
      batches: [
        [{ id: 'a' }, { id: 'b' }],
        [{ id: 'b' }, { id: 'c' }], // b is a dup
        [] // dry -> stop
      ]
    });
    const adapter = createBrowserScrapeAdapter({
      browserProvider: providerReturning(page),
      resolveUrl: (req) => `https://x/${req.target}`,
      extractItems,
      keyOf: (it) => it.id,
      maxScrolls: 5
    });
    const res = await adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'acme', params: {} });
    expect(res.rawItems).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(page.events).toContainEqual(['goto', 'https://x/acme']);
    expect(page.events.filter((e) => e[0] === 'scroll').length).toBeGreaterThan(0);
    expect(page.events).toContainEqual(['close']);
  });

  it('detects a captcha wall from page content and hard-stops (never solved blind)', async () => {
    const page = fakePage({ content: '<html>Please verify you are human</html>' });
    const adapter = createBrowserScrapeAdapter({
      browserProvider: providerReturning(page),
      resolveUrl: () => 'https://x',
      extractItems
    });
    const res = await adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'a', params: {} });
    expect(res).toEqual({ captcha: true });
    expect(page.events).toContainEqual(['close']);
  });

  it('passes proxy/userAgent/cookies through to the browser provider (anti-detect)', async () => {
    const page = fakePage({ batches: [[]] });
    const adapter = createBrowserScrapeAdapter({ browserProvider: providerReturning(page), resolveUrl: () => 'https://x', extractItems });
    await adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'a', params: { proxy: 'http://p', userAgent: 'UA', cookies: [{ name: 'sid', value: '1' }] } });
    expect(page.opened).toMatchObject({ proxy: 'http://p', userAgent: 'UA', cookies: [{ name: 'sid', value: '1' }] });
  });

  it('resolves per-platform url + extractor from an injected selectorRegistry (generic, one adapter)', async () => {
    const page = fakePage({ batches: [[{ id: 'z' }], []] });
    const registry = {
      forPlatform: (platform) => (platform === 'instagram'
        ? { resolveUrl: (req) => `https://ig/${req.target}`, extractItems: () => [] }
        : null)
    };
    const adapter = createBrowserScrapeAdapter({ browserProvider: providerReturning(page), selectorRegistry: registry, keyOf: (it) => it.id });
    const res = await adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'acme', params: {} });
    expect(res.rawItems).toEqual([{ id: 'z' }]);
    expect(page.events).toContainEqual(['goto', 'https://ig/acme']);
  });

  it('fails safe (coded) when the platform has no verified selectors — without launching a browser', async () => {
    const page = fakePage();
    let opened = false;
    const provider = { openPage: async () => { opened = true; return page; } };
    const adapter = createBrowserScrapeAdapter({ browserProvider: provider, selectorRegistry: { forPlatform: () => null } });
    await expect(adapter.scrape({ platform: 'unknown', targetType: 'followers', target: 'a', params: {} }))
      .rejects.toMatchObject({ code: 'SCRAPE_SELECTORS_UNVERIFIED' });
    expect(opened).toBe(false);
  });

  it('closes the page even when navigation throws', async () => {
    const page = fakePage();
    page.goto = async () => { throw new Error('nav failed'); };
    const adapter = createBrowserScrapeAdapter({ browserProvider: providerReturning(page), resolveUrl: () => 'https://x', extractItems });
    await expect(adapter.scrape({ platform: 'x', targetType: 't', target: 'a', params: {} })).rejects.toThrow('nav failed');
    expect(page.events).toContainEqual(['close']);
  });
});
