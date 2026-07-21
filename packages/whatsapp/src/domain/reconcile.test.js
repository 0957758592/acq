import { reconcile } from './reconcile.js';

const config = { poolThreshold: 10, buyBatchSize: 5, autobuyEnabled: true };

function snapshot(overrides = {}) {
  return {
    pool: { available: 10 },
    devices: [],
    campaigns: [],
    config,
    ...overrides
  };
}

describe('reconcile', () => {
  it('emits no intents in a satisfied steady state', () => {
    expect(reconcile(snapshot())).toEqual([]);
  });

  it('emits a buy intent when the pool is below threshold', () => {
    const intents = reconcile(snapshot({ pool: { available: 3 } }));
    expect(intents).toContainEqual({ type: 'buy', quantity: 10 });
  });

  it('does not buy when autobuy is disabled', () => {
    const intents = reconcile(snapshot({
      pool: { available: 3 },
      config: { ...config, autobuyEnabled: false }
    }));
    expect(intents.find((i) => i.type === 'buy')).toBeUndefined();
  });

  it('emits a fill-queue intent for an eligible under-filled device with pool available', () => {
    const intents = reconcile(snapshot({
      pool: { available: 10 },
      devices: [{
        eligible: true,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: [], waitingAccountIds: [] }
      }]
    }));
    expect(intents).toContainEqual({ type: 'fill-queue', deviceId: 'd1', count: 3 });
  });

  it('emits a bring-online intent when a device has a free slot and a waiting account', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: true,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: [], waitingAccountIds: ['a1'] }
      }]
    }));
    expect(intents).toContainEqual({ type: 'bring-online', deviceId: 'd1', accountId: 'a1' });
  });

  it('emits evict + bring-online when a banned account occupies an active slot', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: true,
        bannedActiveAccountIds: ['a1'],
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: ['a1'], waitingAccountIds: ['a2'] }
      }]
    }));
    expect(intents).toContainEqual({ type: 'evict', deviceId: 'd1', accountId: 'a1' });
    expect(intents).toContainEqual({ type: 'bring-online', deviceId: 'd1', accountId: 'a2' });
  });

  it('skips ineligible devices', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: false,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: [], waitingAccountIds: [] }
      }]
    }));
    expect(intents).toEqual([]);
  });

  it('emits expand-reports for an active campaign with online accounts', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: true,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: ['a1'], waitingAccountIds: [] },
        onlineAccountIds: ['a1']
      }],
      campaigns: [{
        id: 'c1', status: 'active', targets: ['+491700000001'],
        strategy: 'all-accounts-report-each-target', doneKeys: []
      }]
    }));
    expect(intents).toContainEqual({
      type: 'expand-reports',
      campaignId: 'c1',
      tasks: [{ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' }]
    });
  });
});
