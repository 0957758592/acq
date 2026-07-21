import { createMongoAccountRepo } from './mongo-account-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    findOneAndUpdate: (filter, update, options) => { calls.push({ filter, update, options }); return returns.findOneAndUpdate; },
    countDocuments: (filter) => { calls.push({ countFilter: filter }); return returns.countDocuments ?? 0; },
    find: (filter) => { calls.push({ findFilter: filter }); return { lean: () => (returns.find ?? []) }; },
    insertMany: (docs, opts) => { calls.push({ insertMany: docs, opts }); return docs; }
  };
}
const doc = (over = {}) => ({ id: 'a1', msisdn: '+491701234567', status: 'assigned', assignedDeviceId: 'd1',
  secretRefs: {}, health: { consecutiveFailures: 0, lastProbeAt: null }, version: 3, ...over });

describe('MongoAccountRepo.save (opt-lock)', () => {
  it('updates on matching version and bumps nothing itself (domain owns version)', async () => {
    const model = fakeModel({ findOneAndUpdate: { _id: 'a1' } });
    const repo = createMongoAccountRepo({ model });
    await repo.save(doc({ version: 3 }));
    const { filter, update } = model.calls[0];
    expect(filter).toEqual({ _id: 'a1', version: 2 });
    expect(update.$set.status).toBe('assigned');
    expect(update.$set.version).toBe(3);
  });
  it('throws CONFLICT when findOneAndUpdate returns null', async () => {
    const model = fakeModel({ findOneAndUpdate: null });
    const repo = createMongoAccountRepo({ model });
    await expect(repo.save(doc({ version: 5 }))).rejects.toThrow('CONFLICT');
  });
  it('countAvailable counts purchased + unassigned', async () => {
    const model = fakeModel({ countDocuments: 7 });
    const repo = createMongoAccountRepo({ model });
    expect(await repo.countAvailable()).toBe(7);
    expect(model.calls[0].countFilter).toEqual({ status: 'purchased', assignedDeviceId: null });
  });
});

describe('MongoAccountRepo.insertPurchased', () => {
  it('bulk-inserts version:0 purchased accounts tagged with metadata.orderId (unordered)', async () => {
    const model = fakeModel();
    const repo = createMongoAccountRepo({ model });
    await repo.insertPurchased(
      [{ msisdn: '+491701234567', source: 'dark_shopping', secretRefs: { session: 'x' } }],
      { orderId: 'o1' }
    );
    const { insertMany, opts } = model.calls[0];
    expect(insertMany).toHaveLength(1);
    expect(insertMany[0]).toEqual({
      msisdn: '+491701234567',
      source: 'dark_shopping',
      secretRefs: { session: 'x' },
      status: 'purchased',
      assignedDeviceId: null,
      version: 0,
      metadata: { orderId: 'o1' }
    });
    expect(opts).toEqual({ ordered: false });
  });
});
