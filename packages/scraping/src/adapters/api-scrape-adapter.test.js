import { createApiScrapeAdapter } from './api-scrape-adapter.js';

function res({ status = 200, json = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}

describe('createApiScrapeAdapter (T3 api tier)', () => {
  it('fetches the resolved API endpoint and picks raw items', async () => {
    const seen = {};
    const fetchImpl = async (url, init) => { seen.url = url; seen.init = init; return res({ json: { data: { users: [{ id: 1 }, { id: 2 }] } } }); };
    const adapter = createApiScrapeAdapter({
      fetchImpl,
      resolveEndpoint: (req) => `https://api.x/${req.target}/followers`,
      pickItems: (json) => json.data.users
    });
    const out = await adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'acme', params: {} });
    expect(out.rawItems).toEqual([{ id: 1 }, { id: 2 }]);
    expect(seen.url).toBe('https://api.x/acme/followers');
  });

  it('supports a request object (method/headers/body) from resolveEndpoint', async () => {
    const seen = {};
    const fetchImpl = async (url, init) => { seen.init = init; return res({ json: { items: [{ id: 9 }] } }); };
    const adapter = createApiScrapeAdapter({
      fetchImpl,
      resolveEndpoint: () => ({ url: 'https://api.x/q', method: 'POST', headers: { 'x-sig': 'abc' }, body: '{"q":1}' }),
      pickItems: (j) => j.items
    });
    await adapter.scrape({ platform: 'tiktok', targetType: 'followers', target: 't', params: {} });
    expect(seen.init).toMatchObject({ method: 'POST', body: '{"q":1}' });
    expect(seen.init.headers['x-sig']).toBe('abc');
  });

  it('hard-stops on a rate limit (429 -> SCRAPE_RATE_LIMITED)', async () => {
    const adapter = createApiScrapeAdapter({ fetchImpl: async () => res({ status: 429 }), resolveEndpoint: () => 'https://api.x', pickItems: () => [] });
    await expect(adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'a', params: {} }))
      .rejects.toMatchObject({ code: 'SCRAPE_RATE_LIMITED' });
  });

  it('fails safe on a non-ok response (SCRAPE_TARGET_UNAVAILABLE)', async () => {
    const adapter = createApiScrapeAdapter({ fetchImpl: async () => res({ status: 500 }), resolveEndpoint: () => 'https://api.x', pickItems: () => [] });
    await expect(adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'a', params: {} }))
      .rejects.toMatchObject({ code: 'SCRAPE_TARGET_UNAVAILABLE' });
  });

  it('resolves per-platform endpoints from a registry; unknown platform is an honest seam', async () => {
    const registry = { forPlatform: (p) => (p === 'instagram' ? { resolveEndpoint: () => 'https://ig/api', pickItems: () => [{ id: 'z' }] } : null) };
    const adapter = createApiScrapeAdapter({ fetchImpl: async () => res({ json: {} }), endpointRegistry: registry });
    await expect(adapter.scrape({ platform: 'instagram', targetType: 'followers', target: 'a', params: {} })).resolves.toEqual({ rawItems: [{ id: 'z' }] });
    await expect(adapter.scrape({ platform: 'nope', targetType: 'followers', target: 'a', params: {} })).rejects.toMatchObject({ code: 'SCRAPE_API_UNVERIFIED' });
  });
});
