import { createMongoDeviceQueueRepo } from './mongo-device-queue-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    findOne: (filter) => { calls.push({ findOneFilter: filter }); return { lean: () => (returns.findOne ?? null) }; },
    find: (filter) => { calls.push({ findFilter: filter }); return { lean: () => (returns.find ?? []) }; },
    findOneAndUpdate: (filter, update, options) => {
      calls.push({ filter, update, options });
      const result = returns.findOneAndUpdate ?? null;
      // save() awaits directly; ensureQueue() chains .lean() — support both.
      return result == null ? result : { ...result, lean: () => result };
    }
  };
}
const queue = (over = {}) => ({ deviceId: 'd1', activeSlots: 1, targetDepth: 3,
  activeAccountIds: ['a1'], waitingAccountIds: ['a2'], version: 3, ...over });

describe('MongoDeviceQueueRepo', () => {
  it('find loads the queue by deviceId (lean)', async () => {
    const model = fakeModel({ findOne: { deviceId: 'd1' } });
    const repo = createMongoDeviceQueueRepo({ model });
    const found = await repo.find('d1');
    expect(model.calls[0].findOneFilter).toEqual({ deviceId: 'd1' });
    expect(found).toEqual({ deviceId: 'd1' });
  });

  it('listAll returns every queue (lean) with an empty filter', async () => {
    const queues = [{ deviceId: 'd1' }, { deviceId: 'd2' }];
    const model = fakeModel({ find: queues });
    const repo = createMongoDeviceQueueRepo({ model });
    const all = await repo.listAll();
    expect(model.calls[0].findFilter).toEqual({});
    expect(all).toEqual(queues);
  });

  it('save opt-locks on version-1 and $sets the bumped version', async () => {
    const model = fakeModel({ findOneAndUpdate: { deviceId: 'd1' } });
    const repo = createMongoDeviceQueueRepo({ model });
    await repo.save(queue({ version: 3 }));
    const { filter, update, options } = model.calls[0];
    expect(filter).toEqual({ deviceId: 'd1', version: 2 });
    expect(update.$set.version).toBe(3);
    expect(update.$set.activeSlots).toBe(1);
    expect(update.$set.targetDepth).toBe(3);
    expect(options).toEqual({ new: true });
  });

  it('save throws CONFLICT when findOneAndUpdate returns null', async () => {
    const model = fakeModel({ findOneAndUpdate: null });
    const repo = createMongoDeviceQueueRepo({ model });
    await expect(repo.save(queue({ version: 4 }))).rejects.toThrow('CONFLICT');
  });

  it('ensureQueue upserts targetDepth and seeds empty slots on insert (lean)', async () => {
    const model = fakeModel({ findOneAndUpdate: { deviceId: 'd1', targetDepth: 3 } });
    const repo = createMongoDeviceQueueRepo({ model });
    const ensured = await repo.ensureQueue('d1', 3);
    const { filter, update, options } = model.calls[0];
    expect(filter).toEqual({ deviceId: 'd1' });
    expect(update.$set).toEqual({ targetDepth: 3 });
    expect(update.$setOnInsert).toEqual({
      deviceId: 'd1', activeSlots: 1, activeAccountIds: [], waitingAccountIds: [], version: 0
    });
    expect(options).toEqual({ upsert: true, new: true });
    expect(ensured).toEqual({ deviceId: 'd1', targetDepth: 3 });
  });
});
