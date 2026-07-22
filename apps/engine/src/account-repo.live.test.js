// LIVE end-to-end test against a real MongoDB (docker-compose.dev.yml + shared
// mongo on 27017, db `acq`). Runs only under `yarn workspace @acq/engine-app
// test:live`. Isolated by a synthetic platform so real data is never touched.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { createMongoAccountRepo } from '@acq/engine-infra';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'e2etest';
const repo = createMongoAccountRepo({ model: EngineAccount });

beforeAll(async () => {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ platform: PLATFORM });
});

afterAll(async () => {
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await disconnectMongo();
});

describe('generic AccountRepo against LIVE Mongo', () => {
  it('insertAcquired then countAvailable + find round-trips', async () => {
    await repo.insertAcquired(
      [
        { platform: PLATFORM, identifier: '@e2e_1', source: 'purchase', secretRefs: {} },
        { platform: PLATFORM, identifier: '@e2e_2', source: 'purchase', secretRefs: {} }
      ],
      { orderId: 'E2E-ORD' }
    );

    expect(await repo.countAvailable({ platform: PLATFORM, source: 'purchase' })).toBe(2);
    const rows = await repo.find({ platform: PLATFORM });
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('acquired');
    expect(rows[0].acquisition.externalOrderId).toBe('E2E-ORD');
  });

  it('save enforces optimistic locking (stale version -> CONFLICT)', async () => {
    await repo.insertAcquired([{ platform: PLATFORM, identifier: '@e2e_lock', source: 'purchase', secretRefs: {} }], {
      orderId: 'E2E-LOCK'
    });
    const [row] = await repo.find({ platform: PLATFORM, identifier: '@e2e_lock' });

    // Domain bumps version to 1 before save; repo opt-locks on version-1 (0).
    const bumped = { id: String(row._id), ...row, version: 1, status: 'assigned', assignedDeviceId: 'dev-e2e' };
    const saved = await repo.save(bumped);
    expect(saved.status).toBe('assigned');
    expect(saved.version).toBe(1);

    // Re-saving with the SAME (now stale) pre-bump version must conflict.
    await expect(repo.save({ ...bumped, version: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
