// LIVE end-to-end: reconcile off real Mongo -> dispatchIntents -> real RabbitMQ
// queue -> consume the job. Proves the autonomous dispatch backbone. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { connectRabbitmq, disconnectRabbitmq, publishJson } from '@acq/core/queue/rabbitmq';
import { EngineAccount } from '@acq/core/models/engine-account';
import { buildEngineContext } from './composition.js';
import { createRabbitJobDispatcher } from './rabbit-dispatcher.js';
import { reconcileTick } from './engine.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const RABBIT = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
const PLATFORM = 'e2etest';
const QUEUE = 'engine.acquire';

let channel;
let ctx;

beforeAll(async () => {
  await connectMongo(URI);
  ({ channel } = await connectRabbitmq(RABBIT));
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.purgeQueue(QUEUE);
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await EngineAccount.insertMany([
    { platform: PLATFORM, identifier: '@df_1', status: 'acquired', assignedDeviceId: null, version: 0 },
    { platform: PLATFORM, identifier: '@df_2', status: 'acquired', assignedDeviceId: null, version: 0 }
  ]);
  ctx = buildEngineContext({
    env: { platforms: [PLATFORM], poolThreshold: 10, buyBatchSize: 5, autobuyEnabled: true },
    deps: {
      jobDispatcher: createRabbitJobDispatcher({ publish: publishJson }),
      // synthetic platform passes the registry filter
      getPlatformCapabilities: (p) => ({ platform: p }),
      listPlatforms: () => [PLATFORM]
    }
  });
});

afterAll(async () => {
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await disconnectRabbitmq();
  await disconnectMongo();
});

describe('autonomous dispatch backbone (LIVE)', () => {
  it('reconcile below threshold enqueues an acquire job on RabbitMQ', async () => {
    await reconcileTick(ctx);

    const job = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no acquire job within 8s')), 8000);
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

    expect(job.jobName).toBe('acquire');
    expect(job.payload).toMatchObject({ platform: PLATFORM, quantity: 10 });
    expect(job.idempotencyKey).toContain('acquire:e2etest:');
  });
});
