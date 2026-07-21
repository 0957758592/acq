import { createRabbitRedisEventBus } from './rabbit-redis-event-bus.js';

function fakeRedis() {
  const published = [];
  let messageHandler = null;
  const sub = {
    subscribed: [],
    subscribe: (ch) => { sub.subscribed.push(ch); },
    on: (evt, cb) => { if (evt === 'message') messageHandler = cb; },
    emit: (ch, msg) => messageHandler && messageHandler(ch, msg)
  };
  return {
    published,
    sub,
    publish: async (ch, msg) => { published.push({ ch, msg }); },
    duplicate: () => sub
  };
}

describe('RabbitRedisEventBus', () => {
  it('publishes the event to the redis channel as JSON', async () => {
    const redis = fakeRedis();
    const bus = createRabbitRedisEventBus({ redis });
    const event = { type: 'account.banned', payload: { accountId: 'a1' } };
    await bus.publish(event);
    expect(redis.published[0]).toEqual({
      ch: 'whatsapp:events',
      msg: JSON.stringify(event)
    });
  });

  it('swallows a redis publish error (never propagates)', async () => {
    const redis = {
      publish: async () => { throw new Error('redis down'); },
      duplicate: () => ({ subscribe: () => {}, on: () => {} })
    };
    const bus = createRabbitRedisEventBus({ redis });
    await expect(
      bus.publish({ type: 'account.banned', payload: {} })
    ).resolves.toBeUndefined();
  });

  it('delivers only matching event types to the handler', () => {
    const redis = fakeRedis();
    const bus = createRabbitRedisEventBus({ redis });
    const calls = [];
    bus.subscribe('account.banned', (evt) => { calls.push(evt); });

    expect(redis.sub.subscribed).toEqual(['whatsapp:events']);

    redis.sub.emit('whatsapp:events', JSON.stringify({ type: 'account.banned', payload: {} }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ type: 'account.banned', payload: {} });

    // Non-matching type is filtered out.
    redis.sub.emit('whatsapp:events', JSON.stringify({ type: 'queue.low' }));
    expect(calls).toHaveLength(1);
  });

  it('ignores malformed JSON without throwing or calling the handler', () => {
    const redis = fakeRedis();
    const bus = createRabbitRedisEventBus({ redis });
    const calls = [];
    bus.subscribe('account.banned', (evt) => { calls.push(evt); });

    expect(() => redis.sub.emit('whatsapp:events', 'not-json{')).not.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('returns the duplicated subscriber connection from subscribe', () => {
    const redis = fakeRedis();
    const bus = createRabbitRedisEventBus({ redis });
    const sub = bus.subscribe('account.banned', () => {});
    expect(sub).toBe(redis.sub);
  });

  it('mirrors the event to publishJson when provided', async () => {
    const redis = fakeRedis();
    const calls = [];
    const publishJson = async (queue, payload) => { calls.push({ queue, payload }); };
    const bus = createRabbitRedisEventBus({ redis, publishJson });
    const event = { type: 'account.banned', payload: { accountId: 'a1' } };
    await bus.publish(event);
    expect(calls[0]).toEqual({ queue: 'whatsapp.events', payload: event });
  });

  it('swallows a publishJson error without breaking the redis publish', async () => {
    const redis = fakeRedis();
    const publishJson = async () => { throw new Error('broker down'); };
    const bus = createRabbitRedisEventBus({ redis, publishJson });
    const event = { type: 'account.banned', payload: {} };
    await expect(bus.publish(event)).resolves.toBeUndefined();
    // Redis publish still happened.
    expect(redis.published[0]).toEqual({ ch: 'whatsapp:events', msg: JSON.stringify(event) });
  });
});
