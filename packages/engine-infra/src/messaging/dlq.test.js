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

  it('re-throws a transient failure (no DLQ)', async () => {
    const consumeJson = fakeConsumeJson();
    const publishJson = fakePublishJson();
    const handler = async () => {
      throw new Error('transient');
    };
    consumeJsonWithDlq('engine.action', handler, { consumeJson, publishJson, clock });
    await expect(consumeJson.wrapped()({ x: 1 })).rejects.toThrow('transient');
    expect(publishJson.calls).toHaveLength(0);
  });
});
