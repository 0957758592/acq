// LIVE GDPR right-to-delete over real Mongo: an account and its action tasks are
// erased together. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { createGdprService } from '@acq/engine-infra';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'e2etest';
const CAMPAIGN = 'e2e-gdpr';

beforeAll(async () => {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
});
afterAll(async () => {
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await EngineActionTask.deleteMany({ campaignId: CAMPAIGN });
  await disconnectMongo();
});

describe('GDPR delete over LIVE Mongo', () => {
  it('erases the account and its action tasks together', async () => {
    const acc = await EngineAccount.create({ platform: PLATFORM, identifier: '@gdpr', status: 'online', version: 0 });
    await EngineActionTask.create({ campaignId: CAMPAIGN, accountId: String(acc._id), target: 't1', actionType: 'follow' });

    const svc = createGdprService({ accountModel: EngineAccount, actionTaskModel: EngineActionTask });
    const res = await svc.deleteAccount(String(acc._id), { tenantId: 'default' });

    expect(res.deleted.account).toBe(1);
    expect(res.deleted.actionTasks).toBe(1);
    expect(await EngineAccount.countDocuments({ _id: acc._id })).toBe(0);
    expect(await EngineActionTask.countDocuments({ accountId: String(acc._id) })).toBe(0);
  });
});
