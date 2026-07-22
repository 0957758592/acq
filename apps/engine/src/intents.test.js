import { dispatchIntents } from './intents.js';

const clock = { now: () => new Date('2026-07-22T09:30:00.000Z') };
const BUCKET = '2026-07-22T09';

function fakeDispatcher() {
  const calls = [];
  return {
    calls,
    dispatch: async (queue, job, opts) => {
      calls.push({ queue, job, opts });
      return { jobRunId: `${queue}:${calls.length}` };
    }
  };
}

describe('dispatchIntents (generic intent -> idempotent job)', () => {
  it('acquire -> engine.acquire with a per-platform hourly key', async () => {
    const d = fakeDispatcher();
    await dispatchIntents([{ type: 'acquire', platform: 'telegram', source: 'purchase', quantity: 10 }], {
      jobDispatcher: d,
      clock
    });
    expect(d.calls[0].queue).toBe('engine.acquire');
    expect(d.calls[0].opts.idempotencyKey).toBe(`acquire:telegram:${BUCKET}`);
    expect(d.calls[0].job.payload).toMatchObject({ platform: 'telegram', quantity: 10 });
  });

  it('fill-queue -> engine.queue-fill keyed by device+platform', async () => {
    const d = fakeDispatcher();
    await dispatchIntents([{ type: 'fill-queue', deviceId: 'dev1', platform: 'telegram', count: 2 }], {
      jobDispatcher: d,
      clock
    });
    expect(d.calls[0].queue).toBe('engine.queue-fill');
    expect(d.calls[0].opts.idempotencyKey).toBe(`fill:dev1:telegram:${BUCKET}`);
  });

  it('bring-online -> engine.bring-online keyed by account', async () => {
    const d = fakeDispatcher();
    await dispatchIntents([{ type: 'bring-online', deviceId: 'dev1', accountId: 'a9' }], { jobDispatcher: d, clock });
    expect(d.calls[0].queue).toBe('engine.bring-online');
    expect(d.calls[0].opts.idempotencyKey).toBe(`online:a9:${BUCKET}`);
  });

  it('evict -> engine.replace keyed by account', async () => {
    const d = fakeDispatcher();
    await dispatchIntents([{ type: 'evict', deviceId: 'dev1', accountId: 'a1' }], { jobDispatcher: d, clock });
    expect(d.calls[0].queue).toBe('engine.replace');
    expect(d.calls[0].opts.idempotencyKey).toBe(`evict:a1:${BUCKET}`);
  });

  it('warmup / acquire-proxy / assign-proxy route to their queues', async () => {
    const d = fakeDispatcher();
    await dispatchIntents(
      [
        { type: 'warmup', deviceId: 'dev1', accountId: 'a2' },
        { type: 'acquire-proxy', geo: 'US', quantity: 5 },
        { type: 'assign-proxy', deviceId: 'dev1' }
      ],
      { jobDispatcher: d, clock }
    );
    expect(d.calls.map((c) => c.queue)).toEqual(['engine.warmup', 'engine.proxy-acquire', 'engine.proxy-assign']);
    expect(d.calls[1].opts.idempotencyKey).toBe(`acquire-proxy:US:${BUCKET}`);
  });

  it('expand-actions fans out one job per task with the exactly-once key', async () => {
    const d = fakeDispatcher();
    await dispatchIntents(
      [
        {
          type: 'expand-actions',
          campaignId: 'c1',
          tasks: [
            { campaignId: 'c1', accountId: 'a1', target: 't1', actionType: 'follow' },
            { campaignId: 'c1', accountId: 'a2', target: 't1', actionType: 'follow' }
          ]
        }
      ],
      { jobDispatcher: d, clock }
    );
    expect(d.calls).toHaveLength(2);
    expect(d.calls[0].queue).toBe('engine.action');
    expect(d.calls[0].opts.idempotencyKey).toBe(`c1:a1:t1:follow:${BUCKET}`);
  });

  it('ignores unknown intent types', async () => {
    const d = fakeDispatcher();
    await dispatchIntents([{ type: 'mystery' }], { jobDispatcher: d, clock });
    expect(d.calls).toHaveLength(0);
  });
});
