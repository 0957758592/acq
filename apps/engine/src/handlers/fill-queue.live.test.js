// LIVE fill-queue over real Mongo: acquired accounts get assigned to a device
// and enqueued; the queue row and account statuses update. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineDeviceQueue } from '@acq/core/models/engine-device-queue';
import { createMongoAccountRepo, createMongoDeviceQueueRepo } from '@acq/engine-infra';
import { fillQueueHandler } from './fill-queue.handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'e2etest';
const DEVICE = 'e2e-dev-1';

const ctx = {
  clock: { now: () => new Date('2026-07-22T14:00:00.000Z') },
  config: { poolThreshold: 10 },
  accountRepo: createMongoAccountRepo({ model: EngineAccount }),
  deviceQueueRepo: createMongoDeviceQueueRepo({ model: EngineDeviceQueue }),
  eventBus: { publish: async () => {} }
};

beforeAll(async () => {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await EngineDeviceQueue.deleteMany({ deviceId: DEVICE });
});
afterAll(async () => {
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await EngineDeviceQueue.deleteMany({ deviceId: DEVICE });
  await disconnectMongo();
});

describe('fill-queue over LIVE Mongo', () => {
  it('assigns acquired accounts to the device queue', async () => {
    await ctx.accountRepo.insertAcquired(
      [
        { platform: PLATFORM, identifier: '@fq_1', source: 'purchase', secretRefs: {} },
        { platform: PLATFORM, identifier: '@fq_2', source: 'purchase', secretRefs: {} }
      ],
      { orderId: 'FQ' }
    );
    await ctx.deviceQueueRepo.ensureQueue(DEVICE, PLATFORM, 3);

    const res = await fillQueueHandler(ctx, { deviceId: DEVICE, platform: PLATFORM, count: 2 });
    expect(res.filled).toBe(2);

    const assigned = await EngineAccount.countDocuments({ platform: PLATFORM, status: 'assigned', assignedDeviceId: DEVICE });
    expect(assigned).toBe(2);

    const queue = await EngineDeviceQueue.findOne({ deviceId: DEVICE, platform: PLATFORM }).lean();
    expect(queue.waitingAccountIds).toHaveLength(2);
  });
});
