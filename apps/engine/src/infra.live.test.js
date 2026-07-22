// LIVE infra round-trip against real RabbitMQ + Redis (docker-compose.dev.yml).
// Runs only under `test:live`. Proves the job transport and event bus work
// end-to-end, not just the pure domain.
import { connectRabbitmq, disconnectRabbitmq, publishJson } from '@acq/core/queue/rabbitmq';
import { getRedis, disconnectRedis } from '@acq/core/db/redis';

const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const QUEUE = 'acq.e2e.roundtrip';

afterAll(async () => {
  await disconnectRabbitmq();
  await disconnectRedis();
});

describe('RabbitMQ job transport (LIVE)', () => {
  it('publishes a job and consumes it back', async () => {
    const { channel } = await connectRabbitmq(RABBIT_URL);
    await channel.assertQueue(QUEUE, { durable: true });
    await channel.purgeQueue(QUEUE);

    const payload = { type: 'acquire', platform: 'telegram', quantity: 5 };
    await publishJson(QUEUE, payload);

    const received = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no message within 8s')), 8000);
      channel.consume(
        QUEUE,
        (msg) => {
          if (!msg) return;
          clearTimeout(timer);
          channel.ack(msg);
          resolve(JSON.parse(msg.content.toString()));
        },
        { noAck: false }
      );
    });

    expect(received).toEqual(payload);
  });
});

describe('Redis event bus (LIVE)', () => {
  it('round-trips a value and a pub/sub message', async () => {
    const redis = getRedis(REDIS_URL);
    await redis.set('acq:e2e:k', 'v', 'EX', 30);
    expect(await redis.get('acq:e2e:k')).toBe('v');

    const sub = redis.duplicate();
    const got = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no pubsub within 8s')), 8000);
      sub.on('message', (_ch, message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    await sub.subscribe('acq:e2e:events');
    await redis.publish('acq:e2e:events', 'account.online');
    expect(await got).toBe('account.online');
    await sub.quit();
  });
});
