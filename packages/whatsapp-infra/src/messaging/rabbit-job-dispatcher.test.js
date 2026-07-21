import { createRabbitJobDispatcher } from './rabbit-job-dispatcher.js';

describe('RabbitJobDispatcher', () => {
  it('maps a (queue, job, opts) call onto dispatchEngineJob', async () => {
    const calls = [];
    const dispatch = (arg) => { calls.push(arg); return { jobRunId: 'jr1' }; };
    const d = createRabbitJobDispatcher({ dispatch });
    const res = await d.dispatch('whatsapp.buy', { jobName: 'buy-accounts', payload: { quantity: 5 } }, { idempotencyKey: 'k' });
    expect(res).toEqual({ jobRunId: 'jr1' });
    expect(calls[0]).toEqual({
      queueName: 'whatsapp.buy', jobName: 'buy-accounts',
      targetType: '', targetId: null, payload: { quantity: 5 },
      maxAttempts: 3, idempotencyKey: 'k'
    });
  });

  it('defaults targetType/targetId/payload/maxAttempts/idempotencyKey', async () => {
    const calls = [];
    const d = createRabbitJobDispatcher({ dispatch: (a) => { calls.push(a); } });
    await d.dispatch('whatsapp.probe', { jobName: 'probe-health' });
    expect(calls[0]).toEqual({
      queueName: 'whatsapp.probe', jobName: 'probe-health',
      targetType: '', targetId: null, payload: {}, maxAttempts: 3, idempotencyKey: ''
    });
  });
});
