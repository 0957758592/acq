import { buildScrapeAdapters } from './composition.js';

describe('scrape-worker composition (default tier wiring)', () => {
  it('wires the browser tier (primary) by default over a Puppeteer provider', () => {
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

  it('wires Telegram web selectors into the DEFAULT browser tier (telegram extracts out of the box; others stay a seam)', async () => {
    const { adapters } = buildScrapeAdapters({ browserProvider: { openPage: async () => { throw new Error('should not open — selectors resolved first'); } } });
    // telegram has verified default selectors → resolves past the seam (fails later at openPage, not at selectors)
    await expect(adapters.browser.scrape({ platform: 'telegram', targetType: 'messages', target: 'g', params: {} }))
      .rejects.toThrow('should not open');
    // an unconfigured platform is still the honest SCRAPE_SELECTORS_UNVERIFIED seam
    await expect(adapters.browser.scrape({ platform: 'reddit', targetType: 'posts', target: 'x', params: {} }))
      .rejects.toMatchObject({ code: 'SCRAPE_SELECTORS_UNVERIFIED' });
  });

  it('wires the api tier (Telegram Bot API) only when a bot token is supplied (opt-in; browser stays default)', () => {
    const fakeBP = { openPage: async () => {} };
    expect(buildScrapeAdapters({ browserProvider: fakeBP }).adapters.api).toBeUndefined();
    const withBot = buildScrapeAdapters({ browserProvider: fakeBP, telegramBotToken: 'BOT-TOKEN' });
    expect(typeof withBot.adapters.api.scrape).toBe('function');
    // browser is still present as the default tier
    expect(typeof withBot.adapters.browser.scrape).toBe('function');
  });
});
