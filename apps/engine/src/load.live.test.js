// LIVE load test (TZ §17): high concurrency against real Mongo — bulk pool,
// concurrent reconciles across platforms, and exactly-once under parallel
// upserts (the load-critical correctness property). test:live.
import { jest } from '@jest/globals';

import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { createMongoAccountRepo, createMongoActionTaskRepo } from '@acq/engine-infra';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORMS = ['e2etest', 'e2eload'];
const CAMPAIGN = 'e2e-load';

const accountRepo = createMongoAccountRepo({ model: EngineAccount });
const taskRepo = createMongoActionTaskRepo({ model: EngineActionTask });

jest.setTimeout(60_000);

beforeAll(async () => {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ platform: { $in: PLATFORMS } });
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await EngineActionTask.createIndexes();
});
afterAll(async () => {
  await EngineAccount.deleteMany({ platform: { $in: PLATFORMS } });
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await disconnectMongo();
});

describe('load / concurrency (LIVE Mongo)', () => {
  it('bulk-inserts a large pool across platforms and counts consistently', async () => {
    const N = 400;
    for (const platform of PLATFORMS) {
      const batch = Array.from({ length: N }, (_v, i) => ({
        platform,
        identifier: `@load_${platform}_${i}`,
        source: 'purchase',
        secretRefs: {}
      }));
      await accountRepo.insertAcquired(batch, { orderId: 'LOAD' });
    }
    const counts = await Promise.all(PLATFORMS.map((p) => accountRepo.countAvailable({ platform: p })));
    expect(counts).toEqual([N, N]);
  });

  it('holds exactly-once under 50 concurrent upserts of the same task key', async () => {
    const key = { campaignId: CAMPAIGN, accountId: 'a1', target: 't1', actionType: 'follow' };
    await Promise.all(Array.from({ length: 50 }, () => taskRepo.upsertTask(key)));
    const count = await EngineActionTask.countDocuments(key);
    expect(count).toBe(1);
  });

  it('sustains concurrent countAvailable reads without error', async () => {
    const reads = await Promise.all(
      Array.from({ length: 100 }, () => accountRepo.countAvailable({ platform: 'e2eload' }))
    );
    expect(reads.every((n) => n === 400)).toBe(true);
  });
});
