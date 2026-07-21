import { fillQueueHandler } from './fill-queue.handler.js';

const fixedClock = { now: () => new Date('2026-07-09T00:00:00.000Z') };

function makeCtx(over = {}) {
  const { countAvailable, ...ctxOver } = over;
  const calls = { accountSaves: [], queueSaves: [], publish: [] };
  const countAvailableFn = countAvailable ?? (async () => 50);
  const ctx = {
    clock: fixedClock,
    config: { poolThreshold: 10 },
    eventBus: {
      publish: async (evt) => {
        calls.publish.push(evt);
      }
    },
    deviceQueueRepo: {
      find: async (deviceId) => {
        if (deviceId !== 'd1') return null;
        return {
          deviceId: 'd1',
          activeSlots: 1,
          targetDepth: 3,
          activeAccountIds: [],
          waitingAccountIds: [],
          version: 0
        };
      },
      save: async (queue) => {
        calls.queueSaves.push(queue);
      }
    },
    accountRepo: {
      find: async () => [
        {
          _id: 'a1',
          msisdn: '+491700000001',
          source: 'dark_shopping',
          secretRefs: {},
          status: 'purchased',
          assignedDeviceId: null,
          health: { consecutiveFailures: 0, lastProbeAt: null },
          version: 0
        }
      ],
      countAvailable: async () => countAvailableFn(),
      save: async (account) => {
        calls.accountSaves.push(account);
      }
    },
    ...ctxOver
  };
  return { ctx, calls };
}

describe('fillQueueHandler', () => {
  it('assigns pool accounts to the device, saving once per single version bump', async () => {
    const { ctx, calls } = makeCtx();

    const result = await fillQueueHandler({ deviceId: 'd1', count: 1 }, ctx);

    expect(result).toEqual({ filled: 1 });

    // Two account saves, same id, versions 1 then 2 — proves single-bump-per-save.
    expect(calls.accountSaves).toHaveLength(2);
    expect(calls.accountSaves[0].id).toBe('a1');
    expect(calls.accountSaves[1].id).toBe('a1');
    expect(calls.accountSaves[0].version).toBe(1);
    expect(calls.accountSaves[1].version).toBe(2);

    // First save is the assignToDevice bump (still purchased), second is the transition.
    expect(calls.accountSaves[0].assignedDeviceId).toBe('d1');
    expect(calls.accountSaves[0].status).toBe('purchased');
    expect(calls.accountSaves[1].status).toBe('assigned');
    expect(calls.accountSaves[1].assignedDeviceId).toBe('d1');

    // One queue save with the enqueued account, version bumped once.
    expect(calls.queueSaves).toHaveLength(1);
    expect(calls.queueSaves[0].waitingAccountIds).toEqual(['a1']);
    expect(calls.queueSaves[0].version).toBe(1);
  });

  it('publishes pool.low (fast-path) when the pool drops below threshold after filling', async () => {
    const { ctx, calls } = makeCtx({ countAvailable: async () => 2 });

    const result = await fillQueueHandler({ deviceId: 'd1', count: 1 }, ctx);

    expect(result).toEqual({ filled: 1 });
    const low = calls.publish.find((e) => e.type === 'pool.low');
    expect(low).toBeDefined();
    expect(low.payload).toEqual({ available: 2 });
  });

  it('does not publish pool.low when the pool is at or above threshold', async () => {
    const { ctx, calls } = makeCtx({ countAvailable: async () => 50 });

    await fillQueueHandler({ deviceId: 'd1', count: 1 }, ctx);

    expect(calls.publish.some((e) => e.type === 'pool.low')).toBe(false);
  });

  it('returns { filled: 0, reason: "no-queue" } when the device has no queue', async () => {
    const { ctx, calls } = makeCtx({
      deviceQueueRepo: {
        find: async () => null,
        save: async () => {
          throw new Error('save should not be called');
        }
      }
    });

    const result = await fillQueueHandler({ deviceId: 'missing', count: 1 }, ctx);

    expect(result).toEqual({ filled: 0, reason: 'no-queue' });
    expect(calls.accountSaves).toHaveLength(0);
    expect(calls.queueSaves).toHaveLength(0);
  });
});
