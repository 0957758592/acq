// EventBus port backed by Redis pub/sub, with an optional durable RabbitMQ
// mirror for consumers that need at-least-once delivery.
//
// `redis` and `publishJson` are injected (in production: `getRedis(env.redisUrl)`
// from `@acq/core/db/redis` and `publishJson` from `@acq/core/queue/rabbitmq`)
// so tests can supply fakes. Publishing is best-effort: a broker/redis failure
// must never propagate and break the calling job. Subscribing uses a dedicated
// (duplicated) Redis connection, as ioredis requires for subscribe mode.

export function createRabbitRedisEventBus({ redis, publishJson = null, channel = 'whatsapp:events' }) {
  return {
    async publish(event) {
      try {
        await redis.publish(channel, JSON.stringify(event));
      } catch {
        // Best-effort: swallow so a publish failure never breaks the job.
      }
      if (publishJson) {
        try {
          await publishJson('whatsapp.events', event);
        } catch {
          // Best-effort durable mirror: swallow failures too.
        }
      }
    },

    subscribe(type, handler) {
      const sub = redis.duplicate();
      sub.subscribe(channel);
      sub.on('message', (ch, message) => {
        let evt;
        try {
          evt = JSON.parse(message);
        } catch {
          return;
        }
        if (evt && evt.type === type) handler(evt);
      });
      return sub;
    }
  };
}
