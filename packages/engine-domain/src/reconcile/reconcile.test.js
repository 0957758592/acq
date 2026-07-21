import { reconcile } from './reconcile.js';

function baseSnapshot(overrides = {}) {
  return {
    platform: 'telegram',
    config: { autobuyEnabled: true, source: 'purchase', poolThreshold: 5, buyBatchSize: 10 },
    pool: { available: 0 },
    devices: [],
    campaigns: [],
    proxyPool: { available: 0, threshold: 0, batchSize: 5, geo: 'US' },
    ...overrides
  };
}

function queue(overrides = {}) {
  return {
    deviceId: 'd1',
    platform: 'telegram',
    activeSlots: 1,
    targetDepth: 3,
    activeAccountIds: [],
    waitingAccountIds: [],
    ...overrides
  };
}

function device(overrides = {}) {
  const { queue: queueOverrides, ...rest } = overrides;
  return {
    deviceId: 'd1',
    eligible: true,
    bannedActiveAccountIds: [],
    onlineAccountIds: [],
    warmupNeededAccountIds: [],
    hasHealthyProxy: true,
    ...rest,
    queue: queue(queueOverrides)
  };
}

const types = (intents) => intents.map((i) => i.type);

describe('poolIntents', () => {
  test('emits acquire when autobuy on and pool below threshold', () => {
    const intents = reconcile(baseSnapshot({ pool: { available: 1 } }));
    const acquire = intents.find((i) => i.type === 'acquire');
    expect(acquire).toMatchObject({ platform: 'telegram', source: 'purchase', quantity: 10 });
  });

  test('no acquire when autobuy disabled', () => {
    const intents = reconcile(baseSnapshot({ config: { autobuyEnabled: false, poolThreshold: 5, buyBatchSize: 10 } }));
    expect(types(intents)).not.toContain('acquire');
  });
});

describe('deviceIntents', () => {
  test('evicts banned active accounts', () => {
    const snap = baseSnapshot({
      pool: { available: 0 },
      devices: [device({ queue: { activeAccountIds: ['a1'] }, bannedActiveAccountIds: ['a1'] })]
    });
    const evict = reconcile(snap).find((i) => i.type === 'evict');
    expect(evict).toMatchObject({ deviceId: 'd1', accountId: 'a1' });
  });

  test('fills a shallow queue bounded by pool budget', () => {
    const snap = baseSnapshot({
      config: { autobuyEnabled: false, poolThreshold: 5, buyBatchSize: 10 },
      pool: { available: 2 },
      devices: [device({ queue: { targetDepth: 3 } })]
    });
    const fill = reconcile(snap).find((i) => i.type === 'fill-queue');
    expect(fill).toMatchObject({ deviceId: 'd1', platform: 'telegram', count: 2 });
  });

  test('brings a waiting account online when a slot is free', () => {
    const snap = baseSnapshot({
      config: { autobuyEnabled: false, poolThreshold: 5, buyBatchSize: 10 },
      devices: [device({ queue: { waitingAccountIds: ['a9'], activeSlots: 1 } })]
    });
    const online = reconcile(snap).find((i) => i.type === 'bring-online');
    expect(online).toMatchObject({ deviceId: 'd1', accountId: 'a9' });
  });

  test('skips ineligible devices', () => {
    const snap = baseSnapshot({ devices: [device({ eligible: false, bannedActiveAccountIds: ['a1'] })] });
    expect(types(reconcile(snap))).not.toContain('evict');
  });
});

describe('warmupIntents', () => {
  test('emits warmup for accounts flagged as under-warmed', () => {
    const snap = baseSnapshot({
      config: { autobuyEnabled: false, poolThreshold: 5, buyBatchSize: 10 },
      devices: [device({ warmupNeededAccountIds: ['a1'] })]
    });
    const warmup = reconcile(snap).find((i) => i.type === 'warmup');
    expect(warmup).toMatchObject({ deviceId: 'd1', accountId: 'a1' });
  });
});

describe('proxyIntents', () => {
  test('acquires proxies when the proxy pool is low', () => {
    const snap = baseSnapshot({ proxyPool: { available: 0, threshold: 2, batchSize: 5, geo: 'US' } });
    const acq = reconcile(snap).find((i) => i.type === 'acquire-proxy');
    expect(acq).toMatchObject({ geo: 'US', quantity: 5 });
  });

  test('assigns a proxy to a device lacking a healthy one', () => {
    const snap = baseSnapshot({
      config: { autobuyEnabled: false, poolThreshold: 5, buyBatchSize: 10 },
      devices: [device({ hasHealthyProxy: false })]
    });
    const assign = reconcile(snap).find((i) => i.type === 'assign-proxy');
    expect(assign).toMatchObject({ deviceId: 'd1' });
  });
});

describe('actionIntents', () => {
  test('expands active campaigns into tasks', () => {
    const snap = baseSnapshot({
      config: { autobuyEnabled: false, poolThreshold: 5, buyBatchSize: 10 },
      devices: [device({ onlineAccountIds: ['a1'] })],
      campaigns: [
        { id: 'c1', platform: 'telegram', actionType: 'follow', status: 'active', strategy: 'all-accounts-per-target', targets: ['t1'], doneKeys: [] }
      ]
    });
    const expand = reconcile(snap).find((i) => i.type === 'expand-actions');
    expect(expand.campaignId).toBe('c1');
    expect(expand.tasks).toHaveLength(1);
  });

  test('ignores non-active campaigns', () => {
    const snap = baseSnapshot({
      config: { autobuyEnabled: false, poolThreshold: 5, buyBatchSize: 10 },
      devices: [device({ onlineAccountIds: ['a1'] })],
      campaigns: [{ id: 'c1', actionType: 'follow', status: 'paused', strategy: 'all-accounts-per-target', targets: ['t1'], doneKeys: [] }]
    });
    expect(types(reconcile(snap))).not.toContain('expand-actions');
  });
});
