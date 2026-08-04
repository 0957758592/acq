import { consumeJsonWithDlq } from './dlq.js';

const FIXED_ISO = '2026-07-22T00:00:00.000Z';

function fakeConsumeJson() {
  const calls = [];
  const fn = (queueName, handler, opts) => {
    calls.push({ queueName, handler, opts });
    return { consumerTag: 'ct-1' };
  };
  fn.calls = calls;
  fn.wrapped = () => calls[0].handler;
  return fn;
}

function fakePublishJson() {
  const calls = [];
  const fn = async (queue, payload) => {
    calls.push({ queue, payload });
  };
  fn.calls = calls;
  return fn;
}

const clock = { now: () => new Date(FIXED_ISO) };

describe('consumeJsonWithDlq (generic)', () => {
  it('registers a wrapped consumer with prefetch and requeueOnError=false', () => {
    const consumeJson = fakeConsumeJson();
    consumeJsonWithDlq('engine.action', async () => {}, { consumeJson, publishJson: fakePublishJson(), clock });
    expect(consumeJson.calls[0].queueName).toBe('engine.action');
    expect(consumeJson.calls[0].opts).toMatchObject({ prefetch: 1, requeueOnError: false });
  });

  it('dead-letters a terminal failure and swallows it (ACK)', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const handler = async () => {
      const e = new Error('permanent boom');
      e.permanent = true;
      throw e;
    };
    consumeJsonWithDlq('engine.action', handler, { consumeJson, publishJson, clock });
    await expect(consumeJson.wrapped()({ x: 1 })).resolves.toBeUndefined();
    expect(publishJson.calls[0].queue).toBe('engine.action.dlq');
    expect(publishJson.calls[0].payload).toMatchObject({ reason: 'permanent boom', payload: { x: 1 } });
  });

  it('with deadLetterTransient, a transient failure is CAPTURED in the DLQ (not lost) — §10', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const warns = [];
    const handler = async () => { const e = new Error('no proxy'); e.code = 'NO_RESIDENTIAL_PROXY_AVAILABLE'; throw e; };
    consumeJsonWithDlq('engine.scrape', handler, { consumeJson, publishJson, clock, logger: { warn: (m, c) => warns.push(c) }, deadLetterTransient: true });
    // resolves (ACK) instead of re-throwing — the job is recorded, never silently dropped
    await expect(consumeJson.wrapped()({ x: 1 })).resolves.toBeUndefined();
    expect(publishJson.calls[0].queue).toBe('engine.scrape.dlq');
    expect(publishJson.calls[0].payload).toMatchObject({ code: 'NO_RESIDENTIAL_PROXY_AVAILABLE' });
  });

  it('re-throws a transient failure (no DLQ) but LOGS it — never fails silently (§6.1/§16)', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const warns = [];
    const logger = { warn: (msg, ctx) => warns.push({ msg, ctx }) };
    const handler = async () => { const e = new Error('no proxy'); e.code = 'NO_RESIDENTIAL_PROXY_AVAILABLE'; throw e; };
    consumeJsonWithDlq('engine.scrape', handler, { consumeJson, publishJson, clock, logger });
    await expect(consumeJson.wrapped()({ x: 1 })).rejects.toThrow('no proxy');
    expect(publishJson.calls).toHaveLength(0);
    // the transient failure is visible in the logs (queue + code), so a parked
    // job never disappears without a trace
    expect(warns[0]).toMatchObject({ ctx: { queue: 'engine.scrape', code: 'NO_RESIDENTIAL_PROXY_AVAILABLE' } });
  });
});
