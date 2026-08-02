import { BROWSER_PROVIDERS, listBrowserProviders } from './browser-providers.js';

describe('browser provider registry', () => {
  it('lists own + browserbase with the port-level shape', () => {
    const provs = listBrowserProviders();
    const ids = provs.map((p) => p.provider);
    expect(ids).toEqual(expect.arrayContaining(['own', 'browserbase']));
    for (const p of provs) {
      expect(p).toHaveProperty('label');
      expect(p).toHaveProperty('kind');
      expect(p).toHaveProperty('capabilities');
    }
  });

  it('reports a self-hosted backend as always configured (no key needed)', () => {
    const own = listBrowserProviders().find((p) => p.provider === 'own');
    expect(own.requiresApiKey).toBe(false);
    expect(own.configured).toBe(true);
    expect(own.kind).toBe('self-hosted');
  });

  it('reports a cloud backend as NOT configured until its key is present', () => {
    const withoutKey = listBrowserProviders().find((p) => p.provider === 'browserbase');
    expect(withoutKey.requiresApiKey).toBe(true);
    expect(withoutKey.configured).toBe(false);

    const withKey = listBrowserProviders({ configured: { browserbase: 'bb-key' } }).find(
      (p) => p.provider === 'browserbase'
    );
    expect(withKey.configured).toBe(true);
  });

  it('exposes the raw registry so backends are added as data, not branches', () => {
    expect(BROWSER_PROVIDERS.own.kind).toBe('self-hosted');
    expect(BROWSER_PROVIDERS.browserbase.baseUrl).toMatch(/browserbase/);
  });
});
