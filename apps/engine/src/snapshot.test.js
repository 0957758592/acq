import { projectSnapshot, planForPlatform } from './snapshot.js';

function fakeCtx() {
  return {
    config: { autobuyEnabled: false, poolThreshold: 10, buyBatchSize: 5, deviceTargetDepth: 3 },
    reconcile: (snap) => snap.__reconciled ?? [],
    accountRepo: {
      countAvailable: async () => 4,
      find: async (f) => {
        if (f.status === 'banned') return [{ _id: 'b1' }];
        if (f.status === 'online') return [{ _id: 'o1' }, { _id: 'o2' }];
        return [];
      }
    },
    deviceModel: { find: () => ({ lean: async () => [{ _id: 'dev1', status: 'running', capacity: { maxAccounts: 2 } }] }) },
    deviceQueueRepo: {
      find: async (deviceId, platform) => ({ deviceId, platform, activeSlots: 2, targetDepth: 3, activeAccountIds: ['o1', 'o2', 'b1'], waitingAccountIds: ['w1'] })
    },
    campaignRepo: { listActiveCampaigns: async () => [{ _id: 'c1', actionType: 'follow', status: 'active', strategy: 'all-accounts-per-target', targets: ['t1'], params: {} }] },
    actionTaskRepo: { doneKeys: async () => ['c1:o1:t1:follow'] }
  };
}

describe('projectSnapshot (real projection)', () => {
  it('projects pool, eligible devices with queue + banned/online, and active campaigns with doneKeys', async () => {
    const snap = await projectSnapshot(fakeCtx(), { platform: 'telegram' });
    expect(snap.pool.available).toBe(4);
    expect(snap.devices).toHaveLength(1);
    expect(snap.devices[0]).toMatchObject({
      deviceId: 'dev1',
      eligible: true,
      bannedActiveAccountIds: ['b1'],
      onlineAccountIds: ['o1', 'o2']
    });
    expect(snap.devices[0].queue.waitingAccountIds).toEqual(['w1']);
    expect(snap.campaigns[0]).toMatchObject({ id: 'c1', actionType: 'follow', doneKeys: ['c1:o1:t1:follow'] });
  });

  it('skips devices the eligibility check rejects', async () => {
    const ctx = fakeCtx();
    ctx.canDeviceAcceptAccount = () => ({ ok: false });
    const snap = await projectSnapshot(ctx, { platform: 'telegram' });
    expect(snap.devices).toHaveLength(0);
  });

  it('projects warmup-needed accounts and real proxy pool when enabled (gated)', async () => {
    const ctx = fakeCtx();
    ctx.config.warmupTargetLevel = 2;
    ctx.config.proxyEnabled = true;
    ctx.config.proxyPoolThreshold = 5;
    // online accounts o1 (level 0), o2 (level 3) -> only o1 needs warmup.
    ctx.accountRepo.find = async (f) => {
      if (f.status === 'banned') return [{ _id: 'b1' }];
      if (f.status === 'online') return [{ _id: 'o1', warmup: { level: 0 } }, { _id: 'o2', warmup: { level: 3 } }];
      return [];
    };
    ctx.proxyRepo = {
      findByDevice: async () => null, // device has no proxy -> hasHealthyProxy false
      findAvailable: async () => [{ _id: 'px1' }, { _id: 'px2' }]
    };
    const snap = await projectSnapshot(ctx, { platform: 'telegram' });
    expect(snap.devices[0].warmupNeededAccountIds).toEqual(['o1']);
    expect(snap.devices[0].hasHealthyProxy).toBe(false);
    expect(snap.proxyPool).toMatchObject({ available: 2, threshold: 5 });
  });

  it('keeps warmup/proxy projection inert by default (no intents unless enabled)', async () => {
    const snap = await projectSnapshot(fakeCtx(), { platform: 'telegram' });
    expect(snap.devices[0].warmupNeededAccountIds).toEqual([]);
    expect(snap.devices[0].hasHealthyProxy).toBe(true);
    expect(snap.proxyPool).toMatchObject({ available: 0, threshold: 0 });
  });

  it('planForPlatform feeds the projection into reconcile', async () => {
    const ctx = fakeCtx();
    ctx.reconcile = (snap) => [{ type: 'seen', devices: snap.devices.length, campaigns: snap.campaigns.length }];
    const intents = await planForPlatform(ctx, { platform: 'telegram' });
    expect(intents[0]).toEqual({ type: 'seen', devices: 1, campaigns: 1 });
  });
});
