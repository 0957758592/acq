// LIVE exactly-once guarantee against real Mongo: upserting the same action-task
// key twice creates exactly one row (unique index + $setOnInsert). test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { createMongoActionTaskRepo } from '@acq/engine-infra';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const CAMPAIGN = 'e2e-campaign';
const repo = createMongoActionTaskRepo({ model: EngineActionTask });
const task = { campaignId: CAMPAIGN, accountId: 'a1', target: 't1', actionType: 'follow' };

beforeAll(async () => {
  await connectMongo(URI);
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await EngineActionTask.createIndexes();
});

afterAll(async () => {
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await disconnectMongo();
});

describe('exactly-once action tasks (LIVE Mongo)', () => {
  it('upserting the same key twice yields exactly one task', async () => {
    await repo.upsertTask(task);
    await repo.upsertTask(task);
    const count = await EngineActionTask.countDocuments({ campaignId: CAMPAIGN });
    expect(count).toBe(1);
  });

  it('markTask done, doneKeys and hasOpenTasks reflect state', async () => {
    expect(await repo.hasOpenTasks(CAMPAIGN)).toBe(true);
    await repo.markTask(task, 'done');
    expect(await repo.doneKeys(CAMPAIGN)).toEqual(['e2e-campaign:a1:t1:follow']);
    expect(await repo.hasOpenTasks(CAMPAIGN)).toBe(false);
  });
});
