import { dispatchIntents } from './intents.js';
import { reportTaskKey } from '@acq/whatsapp';

function fakeDispatcher() {
  const calls = [];
  return {
    calls,
    async dispatch(queue, job, opts) {
      calls.push({ queue, job, opts });
      return { queue, jobName: job.jobName };
    }
  };
}

const clock = { now: () => new Date('2026-07-10T09:00:00.000Z') };

describe('dispatchIntents', () => {
  it('maps a buy intent onto whatsapp.buy with an hourly idempotency bucket', async () => {
    const jobDispatcher = fakeDispatcher();
    await dispatchIntents([{ type: 'buy', quantity: 5 }], { jobDispatcher, clock });

    expect(jobDispatcher.calls).toHaveLength(1);
    const { queue, job, opts } = jobDispatcher.calls[0];
    expect(queue).toBe('whatsapp.buy');
    expect(job).toEqual({ jobName: 'buy-accounts', payload: { quantity: 5 } });
    expect(opts).toEqual({ idempotencyKey: 'buy:2026-07-10T09' });
  });

  it('maps a fill-queue intent onto whatsapp.queue-fill keyed by device + bucket', async () => {
    const jobDispatcher = fakeDispatcher();
    await dispatchIntents([{ type: 'fill-queue', deviceId: 'd1', count: 3 }], { jobDispatcher, clock });

    const { queue, job, opts } = jobDispatcher.calls[0];
    expect(queue).toBe('whatsapp.queue-fill');
    expect(job).toEqual({ jobName: 'fill-queue', payload: { deviceId: 'd1', count: 3 } });
    expect(opts).toEqual({ idempotencyKey: 'fill:d1:2026-07-10T09' });
  });

  it('maps a bring-online intent onto whatsapp.bring-online keyed by account + bucket', async () => {
    const jobDispatcher = fakeDispatcher();
    await dispatchIntents([{ type: 'bring-online', deviceId: 'd1', accountId: 'a1' }], { jobDispatcher, clock });

    const { queue, job, opts } = jobDispatcher.calls[0];
    expect(queue).toBe('whatsapp.bring-online');
    expect(job).toEqual({ jobName: 'bring-online', payload: { deviceId: 'd1', accountId: 'a1' } });
    expect(opts).toEqual({ idempotencyKey: 'online:a1:2026-07-10T09' });
  });

  it('maps an evict intent onto whatsapp.replace keyed by account + bucket', async () => {
    const jobDispatcher = fakeDispatcher();
    await dispatchIntents([{ type: 'evict', deviceId: 'd1', accountId: 'a2' }], { jobDispatcher, clock });

    const { queue, job, opts } = jobDispatcher.calls[0];
    expect(queue).toBe('whatsapp.replace');
    expect(job).toEqual({ jobName: 'replace-banned', payload: { deviceId: 'd1', accountId: 'a2' } });
    expect(opts).toEqual({ idempotencyKey: 'evict:a2:2026-07-10T09' });
  });

  it('fans an expand-reports intent out into one dispatch per task', async () => {
    const jobDispatcher = fakeDispatcher();
    const tasks = [
      { campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' },
      { campaignId: 'c1', accountId: 'a2', targetMsisdn: '+491700000002' }
    ];
    await dispatchIntents([{ type: 'expand-reports', campaignId: 'c1', tasks }], { jobDispatcher, clock });

    expect(jobDispatcher.calls).toHaveLength(2);
    for (const [i, task] of tasks.entries()) {
      const { queue, job, opts } = jobDispatcher.calls[i];
      expect(queue).toBe('whatsapp.report');
      expect(job).toEqual({
        jobName: 'run-report-task',
        payload: { campaignId: task.campaignId, accountId: task.accountId, targetMsisdn: task.targetMsisdn }
      });
      expect(opts).toEqual({ idempotencyKey: `${reportTaskKey(task)}:2026-07-10T09` });
    }
  });

  it('skips unknown intent types and returns the dispatch results', async () => {
    const jobDispatcher = fakeDispatcher();
    const results = await dispatchIntents(
      [{ type: 'nonsense' }, { type: 'buy', quantity: 1 }],
      { jobDispatcher, clock }
    );

    expect(jobDispatcher.calls).toHaveLength(1);
    expect(results).toEqual([{ queue: 'whatsapp.buy', jobName: 'buy-accounts' }]);
  });
});
