import { consumeJsonWithDlq } from './dlq.js';

const FIXED_ISO = '2026-07-09T00:00:00.000Z';

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
  const fn = async (queue, payload) => { calls.push({ queue, payload }); };
  fn.calls = calls;
  return fn;
}

function fakeLogger() {
  const errors = [];
  return { errors, error: (msg, meta) => errors.push({ msg, meta }) };
}

const clock = { now: () => new Date(FIXED_ISO) };
const queueName = 'whatsapp.report';

describe('consumeJsonWithDlq', () => {
  it('registers a wrapped handler with the injected consumeJson and returns its result', () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const ret = consumeJsonWithDlq(queueName, async () => {}, { publishJson, consumeJson, clock });
    expect(consumeJson.calls).toHaveLength(1);
    expect(consumeJson.calls[0].queueName).toBe(queueName);
    expect(typeof consumeJson.calls[0].handler).toBe('function');
    expect(ret).toEqual({ consumerTag: 'ct-1' });
  });

  it('terminal error (permanent) dead-letters and swallows so the original is acked', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const logger = fakeLogger();
    const handler = async () => { throw Object.assign(new Error('boom'), { permanent: true, code: 'X' }); };
    consumeJsonWithDlq(queueName, handler, { publishJson, consumeJson, clock, logger });

    const payload = { taskId: 't1' };
    await expect(consumeJson.wrapped()(payload)).resolves.toBeUndefined();

    expect(publishJson.calls).toHaveLength(1);
    expect(publishJson.calls[0].queue).toBe('whatsapp.report.dlq');
    expect(publishJson.calls[0].payload).toEqual({
      reason: 'boom',
      code: 'X',
      payload,
      failedAt: FIXED_ISO
    });
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0].meta).toEqual({ queue: queueName, code: 'X' });
  });

  it('re-throws the ORIGINAL error and logs when the DLQ publish itself fails', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = async () => { throw new Error('broker down'); };
    const logger = fakeLogger();
    const handler = async () => { throw Object.assign(new Error('boom'), { permanent: true, code: 'X' }); };
    consumeJsonWithDlq(queueName, handler, { publishJson, consumeJson, clock, logger });

    // Original error is re-thrown (not silently lost) so Mongo re-delivery retries.
    await expect(consumeJson.wrapped()({ taskId: 't1' })).rejects.toThrow('boom');

    const failLog = logger.errors.find((e) => e.msg === 'dlq publish failed');
    expect(failLog).toBeDefined();
    expect(failLog.meta).toEqual({
      queue: queueName,
      code: 'X',
      reason: 'boom',
      publishError: 'broker down'
    });
  });

  it('forwards a caller-supplied prefetch (and requeueOnError) to consumeJson', () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    consumeJsonWithDlq(queueName, async () => {}, { publishJson, consumeJson, clock, prefetch: 5 });
    expect(consumeJson.calls[0].opts).toEqual({ prefetch: 5, requeueOnError: false });
  });

  it('terminal error (attempts exhausted) dead-letters', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const handler = async () => { throw Object.assign(new Error('x'), { attempts: 3, maxAttempts: 3 }); };
    consumeJsonWithDlq(queueName, handler, { publishJson, consumeJson, clock });

    await expect(consumeJson.wrapped()({ n: 1 })).resolves.toBeUndefined();

    expect(publishJson.calls).toHaveLength(1);
    expect(publishJson.calls[0].queue).toBe('whatsapp.report.dlq');
    expect(publishJson.calls[0].payload).toEqual({
      reason: 'x',
      code: null,
      payload: { n: 1 },
      failedAt: FIXED_ISO
    });
  });

  it('transient error re-throws and does NOT dead-letter', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const handler = async () => { throw new Error('temp'); };
    consumeJsonWithDlq(queueName, handler, { publishJson, consumeJson, clock });

    await expect(consumeJson.wrapped()({ n: 2 })).rejects.toThrow('temp');
    expect(publishJson.calls).toHaveLength(0);
  });

  it('success resolves and does NOT dead-letter', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const handler = async () => 'ok';
    consumeJsonWithDlq(queueName, handler, { publishJson, consumeJson, clock });

    await expect(consumeJson.wrapped()({ n: 3 })).resolves.toBeUndefined();
    expect(publishJson.calls).toHaveLength(0);
  });
});
