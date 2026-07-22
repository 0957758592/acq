// LIVE full consume path: publish an engine.action job -> DLQ-wrapped consumer
// -> run-action-task handler -> task marked done in real Mongo. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { connectRabbitmq, disconnectRabbitmq, publishJson } from '@acq/core/queue/rabbitmq';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { createMongoActionTaskRepo } from '@acq/engine-infra';
import { registerConsumers } from './consumers.js';
import { runActionTaskHandler } from './handlers/run-action-task.handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const RABBIT = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
const CAMPAIGN = 'e2e-consumer';
const QUEUE = 'engine.action';

let channel;
beforeAll(async () => {
  await connectMongo(URI);
  ({ channel } = await connectRabbitmq(RABBIT));
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.purgeQueue(QUEUE);
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await EngineActionTask.createIndexes();
});
afterAll(async () => {
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await disconnectRabbitmq();
  await disconnectMongo();
});

describe('full consume path (LIVE)', () => {
  it('a published action job is consumed and the task ends done', async () => {
    const events = [];
    const ctx = {
      clock: { now: () => new Date('2026-07-22T12:00:00.000Z') },
      logger: { info: () => {}, error: () => {} },
      actionTaskRepo: createMongoActionTaskRepo({ model: EngineActionTask }),
      automation: { runAction: async () => ({ ok: true }) },
      eventBus: { publish: async (e) => events.push(e.type) }
    };
    registerConsumers(ctx, { handlers: { [QUEUE]: runActionTaskHandler } });

    await publishJson(QUEUE, {
      jobName: 'run-action-task',
      payload: { campaignId: CAMPAIGN, accountId: 'a1', target: 't1', actionType: 'follow' }
    });

    // Poll Mongo until the consumer has processed the job (bounded).
    let row = null;
    for (let i = 0; i < 50; i += 1) {
      row = await EngineActionTask.findOne({ campaignId: CAMPAIGN }).lean();
      if (row && row.status === 'done') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(row).not.toBeNull();
    expect(row.status).toBe('done');
  }, 20_000); // poll budget (5s) + headroom under concurrent load
});
