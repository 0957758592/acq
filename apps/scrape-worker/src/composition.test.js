import { buildScrapeAdapters } from './composition.js';

describe('scrape-worker composition (default tier wiring)', () => {
  it('wires the browser tier (primary) by default over a Playwright provider', () => {
    const { adapters, browserProvider } = buildScrapeAdapters({});
    expect(typeof adapters.browser.scrape).toBe('function');
    expect(typeof browserProvider.openPage).toBe('function');
  });

  it('wires the http tier only when http selectors are supplied', () => {
    const withHttp = buildScrapeAdapters({ httpSelectors: { resolveUrl: () => 'https://x', pickItems: () => [] } });
    expect(typeof withHttp.adapters.http.scrape).toBe('function');
    const without = buildScrapeAdapters({});
    expect(without.adapters.http).toBeUndefined();
  });

  it('the default browser tier fails safe on an unverified platform (empty selector registry)', async () => {
    const { adapters } = buildScrapeAdapters({ browserProvider: { openPage: async () => { throw new Error('should not open'); } } });
    await expect(adapters.browser.scrape({ platform: 'nope', targetType: 'followers', target: 'a', params: {} }))
      .rejects.toMatchObject({ code: 'SCRAPE_SELECTORS_UNVERIFIED' });
  });

  it('uses a supplied browser selector registry for known platforms', () => {
    const browserSelectors = { forPlatform: () => ({ resolveUrl: () => 'https://ig', extractItems: () => [] }) };
    const { adapters } = buildScrapeAdapters({ browserSelectors });
    expect(typeof adapters.browser.scrape).toBe('function');
  });
});
