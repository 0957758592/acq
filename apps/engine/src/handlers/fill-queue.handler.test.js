import { fillQueueHandler } from './fill-queue.handler.js';

const clock = { now: () => new Date('2026-07-22T13:00:00.000Z') };

function fakeCtx({ pool = [], queueDoc = {}, available = 100, poolThreshold = 10 } = {}) {
  const saved = { accounts: [], queues: [] };
  const events = [];
  return {
    saved,
    events,
    clock,
    config: { poolThreshold },
    accountRepo: {
      find: async () => pool,
      countAvailable: async () => available,
      save: async (a) => saved.accounts.push({ id: a.id, status: a.status, assignedDeviceId: a.assignedDeviceId, version: a.version })
    },
    deviceQueueRepo: {
      find: async () => queueDoc,
      save: async (q) => saved.queues.push({ waiting: q.waitingAccountIds, version: q.version })
    },
    eventBus: { publish: async (e) => events.push(e.type) }
  };
}

const acct = (id) => ({ _id: id, platform: 'telegram', identifier: `@${id}`, source: 'purchase', status: 'acquired', assignedDeviceId: null, version: 0 });
const queue = (over = {}) => ({ deviceId: 'd1', platform: 'telegram', activeSlots: 1, targetDepth: 3, activeAccountIds: [], waitingAccountIds: [], version: 0, ...over });

describe('fillQueueHandler', () => {
  it('assigns up to `count` acquired accounts and enqueues them', async () => {
    const ctx = fakeCtx({ pool: [acct('a1'), acct('a2'), acct('a3')], queueDoc: queue() });
    const res = await fillQueueHandler(ctx, { deviceId: 'd1', platform: 'telegram', count: 2 });
    expect(res.filled).toBe(2);
    // each account saved twice (assign bump, then transition bump)
    expect(ctx.saved.accounts).toHaveLength(4);
    expect(ctx.saved.accounts[1].status).toBe('assigned');
    expect(ctx.saved.queues).toHaveLength(2);
  });

  it('returns no-queue when the device has no queue', async () => {
    const ctx = fakeCtx({ queueDoc: null });
    const res = await fillQueueHandler(ctx, { deviceId: 'dX', platform: 'telegram', count: 2 });
    expect(res).toMatchObject({ filled: 0, reason: 'no-queue' });
  });

  it('emits pool.low when filling drains the pool below threshold', async () => {
    const ctx = fakeCtx({ pool: [acct('a1')], queueDoc: queue(), available: 2, poolThreshold: 10 });
    await fillQueueHandler(ctx, { deviceId: 'd1', platform: 'telegram', count: 1 });
    expect(ctx.events).toContain('pool.low');
  });
});
