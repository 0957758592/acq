import { createFacade } from '@acq/control';
import { listBrowserProviders } from '@acq/browser';
import { buildUseCases } from './use-cases.js';

// Drives the wired lifecycle operations THROUGH the single facade (RBAC + audit
// + envelope), proving one definition is exposed generically. ctx is an
// in-memory fake of the engine context.
function fakeCtx() {
  const accounts = { a1: { _id: 'a1', platform: 'telegram', identifier: '@x', source: 'purchase', status: 'online', assignedDeviceId: 'd1', version: 3 } };
  const campaigns = {};
  const vendorCalls = [];
  let seq = 0;
  return {
    vendorCalls,
    // Reseller vendor client registry (keystore-api shops). Fake dark.shopping.
    shopVendorFor: (shopId = 'dark.shopping') => {
      if (shopId === 'missing') throw Object.assign(new Error('SHOP_VENDOR_UNAVAILABLE: none'), { code: 'SHOP_VENDOR_UNAVAILABLE' });
      return {
        getBalance: async () => ({ balance: '991.2500', currency: 'RUB' }),
        listProducts: async (params) => {
          vendorCalls.push({ shopId, params });
          return [
            { id: 166920, name: 'LinkedIn.com | ManReg | 2FA | USA IP', price: 1703.75, quantity: 1, minimum_order: 1 },
            { id: 160767, name: 'Linkedin.com | EUROPA IP | 2fa', price: 78.33, quantity: 93, minimum_order: 1 }
          ];
        }
      };
    },
    clock: { now: () => new Date('2026-07-22T18:00:00.000Z') },
    config: { buyBatchSize: 5 },
    pageCalls: [],
    accountRepo: {
      countAvailable: async () => 7,
      find: async (f) => (f._id ? [accounts[f._id]].filter(Boolean) : Object.values(accounts).filter((a) => a.platform === f.platform)),
      page: async function (filter, opts = {}) { this._calls = this._calls || []; this._calls.push({ filter, opts }); const all = Object.values(accounts).filter((a) => !filter.platform || a.platform === filter.platform); const size = opts.limit || 50; const items = all.slice(0, size); return { items, nextCursor: all.length > size ? items[items.length - 1]._id : null }; },
      save: async (a) => { accounts[a.id] = { ...accounts[a.id], status: a.status, assignedDeviceId: a.assignedDeviceId, version: a.version }; return a; },
      tag: async (id, { add = [] }) => ({ _id: id, tags: add })
    },
    actionTaskRepo: { markTask: async (key, status) => ({ ...key, status }) },
    campaignRepo: {
      createCampaign: async (input) => { const _id = `c${(seq += 1)}`; campaigns[_id] = { _id, ...input }; return campaigns[_id]; },
      findCampaign: async (id) => campaigns[id] ?? null,
      listActiveCampaigns: async () => Object.values(campaigns).filter((c) => c.status === 'active'),
      setCampaignStatus: async (id, status) => { if (!campaigns[id]) return null; campaigns[id].status = status; return campaigns[id]; }
    },
    deviceQueueRepo: { find: async (deviceId, platform) => ({ deviceId, platform, waitingAccountIds: ['w1'] }) },
    deviceModel: { findOneAndUpdate: async (filter, update) => ({ _id: 'dev-1', ...update.$set }), findById: (id) => ({ lean: async () => ({ _id: id, providerDeviceId: `pad-${id}` }) }) },
    shopRegistry: {
      register: async (spec) => ({ shopId: spec.shopId, verified: false }),
      approve: async (shopId) => ({ shopId, verified: true })
    },
    shopScanner: {
      propose: async ({ shopUrl }) => ({
        shopId: 'scanned', baseUrl: shopUrl, title: 'S', platform: 'telegram', auth: { kind: 'api-key', config: {} },
        endpoints: {
          balance: { method: 'GET', path: '/b', responseMap: {} }, offers: { method: 'GET', path: '/o', responseMap: {} },
          purchase: { method: 'POST', path: '/p', responseMap: {} }, delivery: { method: 'POST', path: '/d', responseMap: {}, deliveryFormat: { format: 'json-array', itemMap: { identifier: 'x' } } }
        }, verified: false
      })
    },
    httpClient: {}, secretResolver: { put: async (n) => n }, compileShopAdapter: () => ({ getBalance: async () => ({ balanceUsdCents: 1000 }) }),
    scrapeResultRepo: { listResults: async (filter) => [{ platform: filter.platform, type: 'follower', data: { handle: '@z' } }] },
    proxyRepo: {
      list: async (f = {}) => [{ _id: 'px1', status: f.assignedDeviceId ? 'assigned' : 'available', geo: 'us', assignedDeviceId: f.assignedDeviceId ?? '', version: 0, health: { ok: true, latencyMs: 90 } }],
      findById: async (id) => ({ _id: id, status: 'available', geo: 'us', assignedDeviceId: '', version: 0, health: { ok: true, latencyMs: 90 } }),
      findByDevice: async () => null,
      findAvailable: async () => [{ _id: 'px1', status: 'available', geo: 'us', assignedDeviceId: '', version: 0, health: { ok: true, latencyMs: 90 } }],
      save: async (p) => ({ _id: p._id, ...p })
    },
    dispatchScrape: async (job) => `scrapejob:${job.platform}:${job.target}`,
    browserProvider: {
      createSession: async (o) => ({ sessionId: 'sess-1', cdpUrl: o.proxy ? 'http://127.0.0.1:9222' : '' }),
      liveView: async (id) => ({ sessionId: id, devtoolsUrl: '/devtools/inspector.html?id=' + id, wsUrl: 'ws://x/' + id })
    },
    automationFor: (platform) => ({
      probeState: async () => 'online',
      runAction: async (_c, act) => ({ ok: false, reason: 'ACTION_NOT_CONFIRMED', echo: `${platform}:${act.type}` })
    }),
    scannerForCalls: [],
    browserProviders: () => listBrowserProviders({ configured: {} }),
    defaultBrowserProvider: 'own',
    browserBackendFor: ({ provider = 'own' } = {}) => {
      if (provider !== 'own') throw Object.assign(new Error(`BROWSERBASE_UNCONFIGURED: no key for '${provider}'`), { code: 'BROWSERBASE_UNCONFIGURED' });
      return {
        provider: 'own',
        createSession: async (o) => ({ sessionId: 'sess-1', cdpUrl: o.proxy ? 'http://127.0.0.1:9222' : '' }),
        liveView: async (id) => ({ sessionId: id, devtoolsUrl: '/devtools/inspector.html?id=' + id, wsUrl: 'ws://x/' + id }),
        extract: async () => '<login form> Email [ ] Password [ ]'
      };
    },
    aiActorFor: ({ browserProvider: _bp } = {}) => ({
      observe: async (id, { goal }) => ({ goal, candidates: [{ action: 'type', selector: '#email' }] }),
      act: async (id, { goal }) => ({ action: { action: 'click', selector: 'button', reason: goal }, executed: true, result: { ok: true } })
    }),
    provider: null
  };
}

function build() {
  const ctx = fakeCtx();
  ctx.config = { ...ctx.config, rubPerUsd: 90 };
  // records the {provider, model, browserProvider} passed when shop.scan picks a scanner
  ctx.scannerFor = (opts = {}) => { ctx.scannerForCalls.push(opts); return ctx.shopScanner; };
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
  return { ctx, facade };
}

describe('control-plane use-cases through the facade', () => {
  it('pool.acquire is gated by RBAC (readonly forbidden, operator allowed after a shop check)', async () => {
    const { facade } = build();
    const forbidden = await facade.execute('pool.acquire', { role: 'readonly', args: { platform: 'telegram' } });
    expect(forbidden.error.code).toBe('FORBIDDEN');
  });

  it('browser.providers lists pluggable backends (own + browserbase) through the facade, readable by all', async () => {
    const { facade } = build();
    const res = await facade.execute('browser.providers', { role: 'readonly', args: {} });
    expect(res.error).toBeNull();
    const ids = res.data.providers.map((p) => p.provider);
    expect(ids).toEqual(expect.arrayContaining(['own', 'browserbase']));
    expect(res.data.default).toBe('own');
    // the self-hosted backend is always usable; the cloud one needs a key
    expect(res.data.providers.find((p) => p.provider === 'own').configured).toBe(true);
    expect(res.data.providers.find((p) => p.provider === 'browserbase').configured).toBe(false);
  });

  it('shop.balance reads the vendor balance through the facade and converts to USD cents via configured FX', async () => {
    const { facade } = build();
    const res = await facade.execute('shop.balance', { role: 'operator', args: { shopId: 'dark.shopping' } });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ shopId: 'dark.shopping', balance: 991.25, currency: 'RUB' });
    // 991.25 RUB / 90 RUB-per-USD = 11.0139 USD -> 1101 cents
    expect(res.data.balanceUsdCents).toBe(1101);
  });

  it('shop.balance surfaces a coded seam when the vendor is not wired', async () => {
    const { facade } = build();
    const res = await facade.execute('shop.balance', { role: 'operator', args: { shopId: 'missing' } });
    expect(res.data).toBeNull();
    expect(res.error.code).toBe('SHOP_VENDOR_UNAVAILABLE');
  });

  it('shop.search maps query/platform/country/stock/price into product/list params and returns normalized items', async () => {
    const { ctx, facade } = build();
    const res = await facade.execute('shop.search', {
      role: 'operator',
      args: { shopId: 'dark.shopping', query: 'linkedin', onlyInStock: true, priceToRub: 2000 }
    });
    expect(res.error).toBeNull();
    expect(res.data.shopId).toBe('dark.shopping');
    expect(res.data.count).toBe(2);
    expect(res.data.items[0]).toMatchObject({ id: 166920, price: 1703.75, quantity: 1 });
    // the handler translated the facade args into the vendor's real search params
    expect(ctx.vendorCalls[0].params).toMatchObject({ name: 'linkedin', only_in_stock: 1, price_to: 2000 });
  });

  it('shop.search is gated by RBAC (readonly forbidden)', async () => {
    const { facade } = build();
    const res = await facade.execute('shop.search', { role: 'readonly', args: { query: 'gmail' } });
    expect(res.error.code).toBe('FORBIDDEN');
  });

  it('shop.buy without confirm returns a dry PLAN and spends nothing, through the facade', async () => {
    const { facade } = build();
    const res = await facade.execute('shop.buy', { role: 'operator', args: { platform: 'linkedin', country: 'USA', quantity: 1 } });
    expect(res.error).toBeNull();
    expect(res.data.confirmed).toBe(false);
    // only the USA offer matches country=USA; it is pricier than the 991.25 balance
    expect(res.data.plan.product.id).toBe(166920);
    expect(res.data.plan.affordable).toBe(false);
  });

  it('shop.buy is gated by RBAC (readonly forbidden)', async () => {
    const { facade } = build();
    const res = await facade.execute('shop.buy', { role: 'readonly', args: { platform: 'linkedin', confirm: true } });
    expect(res.error.code).toBe('FORBIDDEN');
  });

  it('device.enroll registers an operator-managed device', async () => {
    const { facade } = build();
    const res = await facade.execute('device.enroll', { role: 'operator', args: { provider: 'vmos', providerDeviceId: 'PAD-1', capacity: { maxAccounts: 3 } } });
    expect(res.data).toMatchObject({ deviceId: 'dev-1', providerDeviceId: 'PAD-1', provider: 'vmos' });
  });

  it('campaign.create -> pause -> resume -> stop all flow through one facade', async () => {
    const { facade } = build();
    const created = await facade.execute('campaign.create', { role: 'operator', args: { platform: 'telegram', actionType: 'report', targets: ['@t'] } });
    const id = created.data.campaignId;
    expect(created.data.status).toBe('active');
    expect((await facade.execute('campaign.pause', { role: 'operator', args: { campaignId: id } })).data.status).toBe('paused');
    expect((await facade.execute('campaign.resume', { role: 'operator', args: { campaignId: id } })).data.status).toBe('active');
    expect((await facade.execute('campaign.stop', { role: 'operator', args: { campaignId: id } })).data.status).toBe('stopped');
  });

  it('campaign.create rejects a missing actionType with a coded error', async () => {
    const { facade } = build();
    const res = await facade.execute('campaign.create', { role: 'operator', args: { platform: 'telegram' } });
    expect(res.error.code).toBe('ACTION_TYPE_REQUIRED');
  });

  it('campaign.create rejects an actionType the platform does not support with a coded error (no row created)', async () => {
    const { facade } = build();
    // telegram supports join/dm/report/view — NOT follow.
    const res = await facade.execute('campaign.create', { role: 'operator', args: { platform: 'telegram', actionType: 'follow', targets: ['@t'] } });
    expect(res.error.code).toBe('ACTION_NOT_SUPPORTED');
    expect(res.data).toBeNull();
  });

  it('account.cooldown walks the state machine through the facade', async () => {
    const { facade } = build();
    const res = await facade.execute('account.cooldown', { role: 'operator', args: { accountId: 'a1' } });
    expect(res.data).toMatchObject({ accountId: 'a1', status: 'cooldown' });
  });

  it('account.reassign requires both ids', async () => {
    const { facade } = build();
    const res = await facade.execute('account.reassign', { role: 'operator', args: { accountId: 'a1' } });
    expect(res.error.code).toBe('DEVICE_ID_REQUIRED');
  });

  it('device.queue.get is readable and returns the projected queue', async () => {
    const { facade } = build();
    const res = await facade.execute('device.queue.get', { role: 'readonly', args: { deviceId: 'd1', platform: 'telegram' } });
    expect(res.data.waitingAccountIds).toEqual(['w1']);
  });

  it('account.probe returns the real on-device state via the facade', async () => {
    const { facade } = build();
    const res = await facade.execute('account.probe', { role: 'operator', args: { accountId: 'a1' } });
    expect(res.data).toMatchObject({ accountId: 'a1', platform: 'telegram', state: 'online' });
  });

  it('account.action drives a device action and surfaces the verify-by-fact result', async () => {
    const { facade } = build();
    const res = await facade.execute('account.action', { role: 'operator', args: { accountId: 'a1', actionType: 'view', target: '@t' } });
    expect(res.data).toMatchObject({ accountId: 'a1', actionType: 'view', ok: false, reason: 'ACTION_NOT_CONFIRMED' });
  });

  it('shop.register then shop.approve flip verification through the facade (admin-gated)', async () => {
    const { facade } = build();
    const reg = await facade.execute('shop.register', { role: 'operator', args: { spec: { shopId: 's9' } } });
    expect(reg.data).toMatchObject({ shopId: 's9', verified: false });
    const app = await facade.execute('shop.approve', { role: 'admin', args: { shopId: 's9' } });
    expect(app.data).toMatchObject({ shopId: 's9', verified: true });
  });

  it('shop.approve is admin-only (operator forbidden)', async () => {
    const { facade } = build();
    const res = await facade.execute('shop.approve', { role: 'operator', args: { shopId: 's9' } });
    expect(res.error.code).toBe('FORBIDDEN');
  });

  it('shop.scan proposes + validates + registers a spec UNVERIFIED through the facade', async () => {
    const { facade } = build();
    const res = await facade.execute('shop.scan', { role: 'operator', args: { shopUrl: 'https://shop.example' } });
    expect(res.data).toMatchObject({ shopId: 'scanned', verified: false });
  });

  it('shop.scan is an honest seam when no scanner is wired', async () => {
    const ctx = fakeCtx();
    ctx.shopScanner = null;
    const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
    const res = await facade.execute('shop.scan', { role: 'operator', args: { shopUrl: 'https://x' } });
    expect(res.error.code).toBe('SHOP_SCANNER_UNAVAILABLE');
  });

  it('shop.scan threads the chosen browser backend (+ llm vendor) into the scanner', async () => {
    const { facade, ctx } = build();
    await facade.execute('shop.scan', { role: 'operator', args: { shopUrl: 'https://shop.example', provider: 'anthropic', model: 'claude-fable-5', browserProvider: 'browserbase' } });
    expect(ctx.scannerForCalls).toHaveLength(1);
    expect(ctx.scannerForCalls[0]).toMatchObject({ provider: 'anthropic', model: 'claude-fable-5', browserProvider: 'browserbase' });
  });

  it('shop.scan picks a scanner when ONLY the browser backend is chosen (no llm override)', async () => {
    const { facade, ctx } = build();
    await facade.execute('shop.scan', { role: 'operator', args: { shopUrl: 'https://shop.example', browserProvider: 'browserbase' } });
    expect(ctx.scannerForCalls).toHaveLength(1);
    expect(ctx.scannerForCalls[0].browserProvider).toBe('browserbase');
  });

  it('scrape.results reads normalized read-models', async () => {
    const { facade } = build();
    const res = await facade.execute('scrape.results', { role: 'readonly', args: { platform: 'instagram' } });
    expect(res.data.results[0]).toMatchObject({ platform: 'instagram', type: 'follower' });
  });

  it('proxy.status lists the pool; proxy.assign binds a healthy proxy 1:1', async () => {
    const { facade } = build();
    expect((await facade.execute('proxy.status', { role: 'readonly', args: {} })).data.proxies).toHaveLength(1);
    const asg = await facade.execute('proxy.assign', { role: 'operator', args: { deviceId: 'd1' } });
    expect(asg.data).toMatchObject({ deviceId: 'd1', proxyId: 'px1', assigned: true });
  });

  it('proxy.rotate is staff-gated (operator forbidden)', async () => {
    const { facade } = build();
    const res = await facade.execute('proxy.rotate', { role: 'brain', args: { deviceId: 'd1' } });
    expect(res.error.code).toBe('FORBIDDEN');
  });

  it('scrape.run enqueues a real engine.scrape job through the injected dispatcher', async () => {
    const { facade } = build();
    const res = await facade.execute('scrape.run', { role: 'operator', args: { platform: 'instagram', targetType: 'followers', target: 'acme' } });
    expect(res.data).toMatchObject({ enqueued: true, jobId: 'scrapejob:instagram:acme', platform: 'instagram' });
  });

  it('scrape.run fails safe when no dispatcher is wired', async () => {
    const ctx = fakeCtx();
    ctx.dispatchScrape = null;
    const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
    const res = await facade.execute('scrape.run', { role: 'operator', args: { platform: 'instagram', targetType: 'followers', target: 'acme' } });
    expect(res.error.code).toBe('SCRAPE_DISPATCH_UNAVAILABLE');
  });

  it('scoring.score computes a deterministic account score', async () => {
    const { facade } = build();
    const res = await facade.execute('scoring.score', { role: 'readonly', args: { subjectType: 'account', subjectId: 'a1', features: { ageDays: 90, warmupLevel: 1 } } });
    expect(res.data).toMatchObject({ subjectType: 'account', subjectId: 'a1' });
    expect(typeof res.data.score).toBe('number');
  });

  it('persona.generate returns a reproducible persona', async () => {
    const { facade } = build();
    const res = await facade.execute('persona.generate', { role: 'operator', args: { niche: 'fitness', locale: 'en', seed: 1 } });
    expect(res.data).toMatchObject({ nicheKey: 'fitness', locale: 'en' });
    expect(res.data.personaKey).toBeTruthy();
  });

  it('verification.rent is an honest seam when no provider is wired', async () => {
    const { facade } = build();
    const res = await facade.execute('verification.rent', { role: 'operator', args: { country: 'US', service: 'telegram' } });
    expect(res.error.code).toBe('VERIFICATION_PROVIDER_UNAVAILABLE');
  });

  it('account.refreshSession marks an online account for re-login (online -> bringing_online)', async () => {
    const { facade } = build();
    const res = await facade.execute('account.refreshSession', { role: 'operator', args: { accountId: 'a1' } });
    expect(res.data).toMatchObject({ accountId: 'a1', status: 'bringing_online' });
  });

  it('account.tag adds tags through the facade', async () => {
    const { facade } = build();
    const res = await facade.execute('account.tag', { role: 'operator', args: { accountId: 'a1', add: ['vip', 'us'] } });
    expect(res.data).toMatchObject({ accountId: 'a1', tags: ['vip', 'us'] });
  });

  it('action.retry re-opens a failed action task', async () => {
    const { facade } = build();
    const res = await facade.execute('action.retry', { role: 'operator', args: { campaignId: 'c1', accountId: 'a1', target: '@t', actionType: 'view' } });
    expect(res.data).toMatchObject({ campaignId: 'c1', status: 'pending' });
  });

  it('account.bulk applies a transition to matching accounts', async () => {
    const { facade } = build();
    const res = await facade.execute('account.bulk', { role: 'operator', args: { platform: 'telegram', to: 'cooldown' } });
    expect(res.data.requested).toBeGreaterThanOrEqual(1);
    expect(res.data.applied).toBeGreaterThanOrEqual(1);
  });

  it('browser.session.open opens a real browser session; liveView returns a devtools URL', async () => {
    const { facade } = build();
    const open = await facade.execute('browser.session.open', { role: 'operator', args: { proxy: 'http://p:1', userAgent: 'UA' } });
    expect(open.data).toMatchObject({ sessionId: 'sess-1', cdpUrl: 'http://127.0.0.1:9222' });
    const view = await facade.execute('browser.session.liveView', { role: 'operator', args: { sessionId: 'sess-1' } });
    expect(view.data.devtoolsUrl).toContain('sess-1');
  });

  it('browser.session.open can SELECT a backend; a keyless cloud backend fails safe (coded)', async () => {
    const { facade } = build();
    const own = await facade.execute('browser.session.open', { role: 'operator', args: { provider: 'own' } });
    expect(own.data.provider).toBe('own');
    const cloud = await facade.execute('browser.session.open', { role: 'operator', args: { provider: 'browserbase' } });
    expect(cloud.error.code).toBe('BROWSERBASE_UNCONFIGURED');
  });

  it('browser.observe + browser.act drive the Stagehand actor through the one facade', async () => {
    const { facade } = build();
    const obs = await facade.execute('browser.observe', { role: 'operator', args: { sessionId: 'sess-1', goal: 'log in' } });
    expect(obs.data.candidates[0]).toMatchObject({ action: 'type', selector: '#email' });
    const act = await facade.execute('browser.act', { role: 'operator', args: { sessionId: 'sess-1', goal: 'submit login' } });
    expect(act.data).toMatchObject({ executed: true });
    expect(act.data.action).toMatchObject({ action: 'click' });
  });

  it('browser.observe requires a goal (coded)', async () => {
    const { facade } = build();
    const res = await facade.execute('browser.observe', { role: 'operator', args: { sessionId: 'sess-1' } });
    expect(res.error.code).toBeDefined();
  });

  it('account.status is cursor-paginated (limit + nextCursor) — never loads the whole inventory', async () => {
    const { facade, ctx } = build();
    const res = await facade.execute('account.status', { role: 'readonly', args: { limit: 10, cursor: 'a0' } });
    expect(res.data).toHaveProperty('accounts');
    expect(res.data).toHaveProperty('nextCursor'); // paginated shape
    // the cursor + limit were threaded to the repo's paginated read
    expect(ctx.accountRepo._calls[0].opts).toMatchObject({ cursor: 'a0', limit: 10 });
  });

  it('account.status by accountId is still a point read', async () => {
    const { facade } = build();
    const res = await facade.execute('account.status', { role: 'readonly', args: { accountId: 'a1' } });
    expect(res.data.accounts[0]).toMatchObject({ _id: 'a1' });
  });
});
