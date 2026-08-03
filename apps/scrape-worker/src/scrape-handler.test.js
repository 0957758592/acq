import { scrapeTaskHandler } from './scrape-handler.js';

const clock = { now: () => new Date('2026-07-22T15:00:00.000Z') };

function fakeCtx({ entities = [], proxies = null } = {}) {
  const upserted = [];
  const events = [];
  const scraped = [];
  const ctx = {
    upserted,
    events,
    scraped,
    clock,
    scrapeProvider: { scrape: async (payload) => { scraped.push(payload); return { tier: 'browser', entities }; } },
    scrapeResultRepo: { upsertResults: async (e) => upserted.push(...e) },
    eventBus: { publish: async (ev) => events.push(ev.type) }
  };
  if (proxies) {
    ctx.proxyRepo = { findAvailable: async () => proxies };
    ctx.secretResolver = { resolve: async () => ({ protocol: 'http', host: 'res.example', port: 8000, username: 'u', password: 'p' }) };
  }
  return ctx;
}

describe('scrapeTaskHandler', () => {
  it('scrapes, upserts the normalized entities and emits scrape.done', async () => {
    const entities = [{ platform: 'ig', type: 'follower', key: 'ig:follower:@s:@f', data: {} }];
    const ctx = fakeCtx({ entities });
    const res = await scrapeTaskHandler(ctx, {
      platform: 'ig',
      targetType: 'followers',
      target: '@s',
      routing: { needsLogin: true }
    });
    expect(res).toMatchObject({ tier: 'browser', upserted: 1 });
    expect(ctx.upserted).toHaveLength(1);
    expect(ctx.events).toContain('scrape.done');
  });

  it('handles an empty scrape result (still emits done, upserts nothing)', async () => {
    const ctx = fakeCtx({ entities: [] });
    const res = await scrapeTaskHandler(ctx, { platform: 'ig', targetType: 'profile', target: '@s' });
    expect(res.upserted).toBe(0);
    expect(ctx.events).toContain('scrape.done');
  });

  it('auto-picks a residential proxy from the pool when params.useResidential is set (IG scraper)', async () => {
    const ctx = fakeCtx({ proxies: [{ _id: 'px-res', type: 'residential', geo: 'US', status: 'available', health: { ok: true }, secretRef: 'vault:r' }] });
    await scrapeTaskHandler(ctx, { platform: 'instagram', targetType: 'followers', target: '@nike', params: { useResidential: true, geo: 'US' } });
    // the resolved authenticated residential URL was injected into the scrape session
    expect(ctx.scraped[0].params.proxy).toBe('http://u:p@res.example:8000');
  });

  it('does NOT override an explicitly-supplied proxy', async () => {
    const ctx = fakeCtx({ proxies: [{ _id: 'px', type: 'residential', geo: 'US', status: 'available', health: { ok: true }, secretRef: 'r' }] });
    await scrapeTaskHandler(ctx, { platform: 'instagram', targetType: 'followers', target: '@x', params: { useResidential: true, proxy: 'http://mine:1' } });
    expect(ctx.scraped[0].params.proxy).toBe('http://mine:1');
  });

  it('coded seam when useResidential but no residential proxy is available', async () => {
    const ctx = fakeCtx({ proxies: [] });
    await expect(scrapeTaskHandler(ctx, { platform: 'instagram', targetType: 'followers', target: '@x', params: { useResidential: true } }))
      .rejects.toMatchObject({ code: 'NO_RESIDENTIAL_PROXY_AVAILABLE' });
  });
});
