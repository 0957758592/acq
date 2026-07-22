import { registerConsumers, ENGINE_HANDLERS } from './consumers.js';

function fakeConsumeJson() {
  const calls = [];
  const fn = (queue, handler, opts) => {
    calls.push({ queue, handler, opts });
    return { consumerTag: `ct-${calls.length}` };
  };
  fn.calls = calls;
  return fn;
}

describe('ENGINE_HANDLERS', () => {
  test('maps engine.action to a handler', () => {
    expect(typeof ENGINE_HANDLERS['engine.action']).toBe('function');
  });
});

describe('registerConsumers', () => {
  test('registers a DLQ-wrapped consumer per handler queue', () => {
    const consumeJson = fakeConsumeJson();
    const ctx = { clock: { now: () => new Date('2026-07-22T00:00:00.000Z') }, logger: {} };
    registerConsumers(ctx, {
      consumeJson,
      publishJson: async () => {},
      handlers: { 'engine.action': async () => {} }
    });
    expect(consumeJson.calls.map((c) => c.queue)).toEqual(['engine.action']);
    expect(consumeJson.calls[0].opts).toMatchObject({ prefetch: 1, requeueOnError: false });
  });

  test('the registered consumer routes the job payload to the handler with ctx', async () => {
    const consumeJson = fakeConsumeJson();
    const seen = [];
    const ctx = { clock: { now: () => new Date('2026-07-22T00:00:00.000Z') }, logger: {} };
    registerConsumers(ctx, {
      consumeJson,
      publishJson: async () => {},
      handlers: { 'engine.action': async (c, payload) => seen.push({ c, payload }) }
    });
    // The DLQ wrapper hands the raw message to our routing fn.
    await consumeJson.calls[0].handler({ jobName: 'run-action-task', payload: { campaignId: 'c1' } });
    expect(seen[0].c).toBe(ctx);
    expect(seen[0].payload).toEqual({ campaignId: 'c1' });
  });
});
