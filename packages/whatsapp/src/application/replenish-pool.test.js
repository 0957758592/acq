import { replenishPool } from './replenish-pool.js';

function makePorts(overrides = {}) {
  const calls = { countAvailable: 0, dispatch: [] };
  const accountRepo = {
    async countAvailable() {
      calls.countAvailable += 1;
      return overrides.available ?? 0;
    }
  };
  const jobDispatcher = {
    async dispatch(queue, job, opts) {
      calls.dispatch.push({ queue, job, opts });
    }
  };
  const config = { poolThreshold: 10, buyBatchSize: 5 };
  const clock = { now: () => new Date('2026-07-10T09:00:00.000Z') };
  return { ports: { accountRepo, jobDispatcher, config, clock }, calls };
}

describe('replenishPool', () => {
  it('dispatches an hour-bucketed buy job when the pool is below threshold', async () => {
    const { ports, calls } = makePorts({ available: 3 });

    const result = await replenishPool(ports);

    expect(calls.countAvailable).toBe(1);
    expect(calls.dispatch).toEqual([
      {
        queue: 'whatsapp.buy',
        job: { jobName: 'buy-accounts', payload: { quantity: 10 } },
        opts: { idempotencyKey: 'buy:2026-07-10T09' }
      }
    ]);
    expect(result).toEqual({ dispatched: true, quantity: 10, available: 3 });
  });

  it('does not dispatch when the pool is at or above threshold', async () => {
    const { ports, calls } = makePorts({ available: 10 });

    const result = await replenishPool(ports);

    expect(calls.countAvailable).toBe(1);
    expect(calls.dispatch).toEqual([]);
    expect(result).toEqual({ dispatched: false, available: 10 });
  });
});
