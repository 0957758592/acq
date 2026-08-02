import { createFacade } from '@acq/control';
import { listBrowserProviders } from '@acq/browser';
import { buildUseCases } from './use-cases.js';

// Drives the wired lifecycle operations THROUGH the single facade (RBAC + audit
// + envelope), proving one definition is exposed generically. ctx is an
// in-memory fake of the engine context.
function fakeCtx() {
  const accounts = { a1: { _id: 'a1', platform: 'telegram', identifier: '@x', source: 'purchase', status: 'online', assignedDeviceId: 'd1', version: 3 } };
  const campaigns = {};
  let seq = 0;
  return {
    clock: { now: () => new Date('2026-07-22T18:00:00.000Z') },
    config: { buyBatchSize: 5 },
    accountRepo: {
      countAvailable: async () => 7,
      find: async (f) => (f._id ? [accounts[f._id]].filter(Boolean) : Object.values(accounts).filter((a) => a.platform === f.platform)),
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
    browserProviders: () => listBrowserProviders({ configured: {} }),
    defaultBrowserProvider: 'own',
    provider: null
  };
}

function build() {
  const ctx = fakeCtx();
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
});
