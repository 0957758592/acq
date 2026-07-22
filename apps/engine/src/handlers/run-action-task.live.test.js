// LIVE: run-action-task handler over the real action-task repo (Mongo) with a
// fake automation. Proves the handler persists exactly-once state end-to-end.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { createMongoActionTaskRepo } from '@acq/engine-infra';
import { runActionTaskHandler } from './run-action-task.handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const CAMPAIGN = 'e2e-handler';
const payload = { campaignId: CAMPAIGN, accountId: 'a1', target: 't1', actionType: 'follow' };

function ctx(actionResult) {
  const events = [];
  return {
    events,
    clock: { now: () => new Date('2026-07-22T11:00:00.000Z') },
    actionTaskRepo: createMongoActionTaskRepo({ model: EngineActionTask }),
    automation: { runAction: async () => actionResult },
    eventBus: { publish: async (e) => events.push(e.type) }
  };
}

beforeAll(async () => {
  await connectMongo(URI);
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await EngineActionTask.createIndexes();
});
afterAll(async () => {
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await disconnectMongo();
});

describe('run-action-task handler over LIVE Mongo', () => {
  it('marks the task done and is idempotent on re-run', async () => {
    const c = ctx({ ok: true });
    await runActionTaskHandler(c, payload);

    let row = await EngineActionTask.findOne({ campaignId: CAMPAIGN }).lean();
    expect(row.status).toBe('done');
    expect(c.events).toEqual(expect.arrayContaining(['action.done', 'campaign.completed']));

    // Re-running the same task must not create a duplicate (exactly-once).
    await runActionTaskHandler(ctx({ ok: true }), payload);
    const count = await EngineActionTask.countDocuments({ campaignId: CAMPAIGN });
    expect(count).toBe(1);
  });
});
