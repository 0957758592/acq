import { replaceBannedHandler } from './replace-banned.handler.js';

const fixedClock = { now: () => new Date('2026-07-09T00:00:00.000Z') };

function makeAccountDoc(over = {}) {
  return {
    _id: 'a1',
    status: 'banned',
    assignedDeviceId: 'd1',
    msisdn: '+491700000001',
    source: 'dark_shopping',
    secretRefs: {},
    health: { consecutiveFailures: 3, lastProbeAt: null },
    version: 0,
    ...over
  };
}

function makeQueueDoc(over = {}) {
  return {
    deviceId: 'd1',
    activeSlots: 1,
    targetDepth: 3,
    activeAccountIds: ['a1'],
    waitingAccountIds: ['a2'],
    version: 0,
    ...over
  };
}

function makeCtx({ accountDoc, queueDoc } = {}) {
  const calls = { accountSaves: [], queueSaves: [], publish: [] };
  const acctDoc = accountDoc === undefined ? makeAccountDoc() : accountDoc;
  const qDoc = queueDoc === undefined ? makeQueueDoc() : queueDoc;

  const ctx = {
    clock: fixedClock,
    accountRepo: {
      find: async (query) => {
        calls.find = query;
        return acctDoc ? [acctDoc] : [];
      },
      save: async (account) => {
        calls.accountSaves.push(account);
      }
    },
    deviceQueueRepo: {
      find: async (deviceId) => {
        calls.queueFind = deviceId;
        return qDoc;
      },
      save: async (queue) => {
        calls.queueSaves.push(queue);
      }
    },
    eventBus: {
      publish: async (evt) => {
        calls.publish.push(evt);
      }
    }
  };
  return { ctx, calls };
}

describe('replaceBannedHandler', () => {
  it('retires the banned account, evicts it, promotes the next, and emits queue.low', async () => {
    const { ctx, calls } = makeCtx();

    const result = await replaceBannedHandler({ deviceId: 'd1', accountId: 'a1' }, ctx);

    expect(result).toEqual({ retired: true, promoted: 'a2' });

    // One account save, single bump, final status retired.
    expect(calls.accountSaves).toHaveLength(1);
    expect(calls.accountSaves[0].version).toBe(1);
    expect(calls.accountSaves[0].status).toBe('retired');

    // Two queue saves, single bump each: evict (v1) then promote (v2).
    expect(calls.queueSaves).toHaveLength(2);
    expect(calls.queueSaves[0].version).toBe(1);
    expect(calls.queueSaves[0].activeAccountIds).toEqual([]);
    expect(calls.queueSaves[0].waitingAccountIds).toEqual(['a2']);
    expect(calls.queueSaves[1].version).toBe(2);
    expect(calls.queueSaves[1].activeAccountIds).toEqual(['a2']);
    expect(calls.queueSaves[1].waitingAccountIds).toEqual([]);

    // queue.low emitted: depth 1 < targetDepth 3.
    expect(calls.publish).toHaveLength(1);
    expect(calls.publish[0].type).toBe('queue.low');
    expect(calls.publish[0].payload.deviceId).toBe('d1');
    expect(calls.publish[0].payload.depth).toBe(1);
  });

  it('retires the account but performs no queue work when the device has no queue', async () => {
    const { ctx, calls } = makeCtx({ queueDoc: null });

    const result = await replaceBannedHandler({ deviceId: 'd1', accountId: 'a1' }, ctx);

    expect(result).toEqual({ retired: true, promoted: null });
    expect(calls.accountSaves).toHaveLength(1);
    expect(calls.accountSaves[0].status).toBe('retired');
    expect(calls.queueSaves).toHaveLength(0);
    expect(calls.publish).toHaveLength(0);
  });

  it('does not retire a non-banned account but still processes the queue eviction', async () => {
    const { ctx, calls } = makeCtx({ accountDoc: makeAccountDoc({ status: 'online' }) });

    const result = await replaceBannedHandler({ deviceId: 'd1', accountId: 'a1' }, ctx);

    expect(result).toEqual({ retired: false, promoted: 'a2' });

    // Not banned -> no account save.
    expect(calls.accountSaves).toHaveLength(0);

    // Queue still evicted + promoted.
    expect(calls.queueSaves).toHaveLength(2);
    expect(calls.queueSaves[1].activeAccountIds).toEqual(['a2']);
    expect(calls.queueSaves[1].waitingAccountIds).toEqual([]);
    expect(calls.publish).toHaveLength(1);
    expect(calls.publish[0].type).toBe('queue.low');
  });
});
