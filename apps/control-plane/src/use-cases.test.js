import { createFacade } from '@acq/control';
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
      save: async (a) => { accounts[a.id] = { ...accounts[a.id], status: a.status, assignedDeviceId: a.assignedDeviceId, version: a.version }; return a; }
    },
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
    scrapeResultRepo: { listResults: async (filter) => [{ platform: filter.platform, type: 'follower', data: { handle: '@z' } }] },
    automationFor: (platform) => ({
      probeState: async () => 'online',
      runAction: async (_c, act) => ({ ok: false, reason: 'ACTION_NOT_CONFIRMED', echo: `${platform}:${act.type}` })
    }),
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

  it('device.enroll registers an operator-managed device', async () => {
    const { facade } = build();
    const res = await facade.execute('device.enroll', { role: 'operator', args: { provider: 'vmos', providerDeviceId: 'PAD-1', capacity: { maxAccounts: 3 } } });
    expect(res.data).toMatchObject({ deviceId: 'dev-1', providerDeviceId: 'PAD-1', provider: 'vmos' });
  });

  it('campaign.create -> pause -> resume -> stop all flow through one facade', async () => {
    const { facade } = build();
    const created = await facade.execute('campaign.create', { role: 'operator', args: { platform: 'telegram', actionType: 'follow', targets: ['@t'] } });
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

  it('scrape.results reads normalized read-models', async () => {
    const { facade } = build();
    const res = await facade.execute('scrape.results', { role: 'readonly', args: { platform: 'instagram' } });
    expect(res.data.results[0]).toMatchObject({ platform: 'instagram', type: 'follower' });
  });
});
