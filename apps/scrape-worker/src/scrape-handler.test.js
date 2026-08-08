import { scrapeTaskHandler } from './scrape-handler.js';

const clock = { now: () => new Date('2026-07-22T15:00:00.000Z') };

function fakeCtx({ entities = [], proxies = null, scrapeError = null } = {}) {
  const upserted = [];
  const events = [];
  const scraped = [];
  const telemetry = [];
  const ctx = {
    upserted,
    events,
    scraped,
    telemetry,
    clock,
    scrapeProvider: { scrape: async (payload) => { scraped.push(payload); if (scrapeError) throw scrapeError; return { tier: 'browser', entities }; } },
    scrapeResultRepo: { upsertResults: async (e) => upserted.push(...e) },
    telemetryRepo: { recordMany: async (evs) => { telemetry.push(...evs); return { inserted: evs.length }; } },
    domainMetrics: { recordCaptcha: () => {} },
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

  it('emits a parser telemetry event on success (itemsOut + tier + ok outcome)', async () => {
    const entities = [{ platform: 'ig', type: 'follower', key: 'k1', data: {} }, { platform: 'ig', type: 'follower', key: 'k2', data: {} }];
    const ctx = fakeCtx({ entities });
    await scrapeTaskHandler(ctx, { platform: 'instagram', targetType: 'followers', target: '@nike' });
    expect(ctx.telemetry).toHaveLength(1);
    expect(ctx.telemetry[0]).toMatchObject({ platform: 'instagram', source: 'scrape', kind: 'scrape.followers', target: '@nike', tier: 'browser', outcome: 'ok' });
    expect(ctx.telemetry[0].metrics.itemsOut).toBe(2);
  });

  it('records a FAILED telemetry event when a captcha wall is hit, then re-throws', async () => {
    const ctx = fakeCtx({ scrapeError: Object.assign(new Error('SCRAPE_CAPTCHA'), { code: 'SCRAPE_CAPTCHA' }) });
    await expect(scrapeTaskHandler(ctx, { platform: 'tiktok', targetType: 'messages', target: '@x', params: { via: 'mtproto' } }))
      .rejects.toMatchObject({ code: 'SCRAPE_CAPTCHA' });
    expect(ctx.telemetry).toHaveLength(1);
    expect(ctx.telemetry[0]).toMatchObject({ platform: 'tiktok', kind: 'scrape.messages', outcome: 'failed' });
    expect(ctx.telemetry[0].metrics).toMatchObject({ captchas: 1, errors: 1 });
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
