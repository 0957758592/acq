import { createMongoDeviceQueueRepo } from './mongo-device-queue-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  const chain = (val) => ({ lean: () => val });
  return {
    calls,
    findOne: (filter) => {
      calls.push({ findOne: filter });
      return chain(returns.findOne ?? null);
    },
    find: (filter) => {
      calls.push({ find: filter });
      return chain(returns.find ?? []);
    },
    findOneAndUpdate: (filter, update, options) => {
      calls.push({ filter, update, options });
      const val = returns.findOneAndUpdate;
      return options?.upsert ? chain(val ?? { _id: 'q1' }) : (val === undefined ? { _id: 'q1' } : val);
    }
  };
}

const queue = (over = {}) => ({
  deviceId: 'd1',
  platform: 'telegram',
  activeSlots: 1,
  targetDepth: 3,
  activeAccountIds: ['a1'],
  waitingAccountIds: [],
  version: 2,
  ...over
});

describe('generic MongoDeviceQueueRepo', () => {
  it('find keys on deviceId + platform', async () => {
    const model = fakeModel();
    await createMongoDeviceQueueRepo({ model }).find('d1', 'telegram');
    expect(model.calls[0].findOne).toEqual({ tenantId: 'default', deviceId: 'd1', platform: 'telegram' });
  });

  it('listAll optionally filters by platform', async () => {
    const model = fakeModel();
    await createMongoDeviceQueueRepo({ model }).listAll('telegram');
    expect(model.calls[0].find).toEqual({ tenantId: 'default', platform: 'telegram' });
  });

  it('ensureQueue upserts with $setOnInsert including platform', async () => {
    const model = fakeModel();
    await createMongoDeviceQueueRepo({ model }).ensureQueue('d1', 'telegram', 5);
    const { filter, update, options } = model.calls[0];
    expect(filter).toEqual({ tenantId: 'default', deviceId: 'd1', platform: 'telegram' });
    expect(options.upsert).toBe(true);
    expect(update.$set.targetDepth).toBe(5);
    expect(update.$setOnInsert).toMatchObject({ tenantId: 'default', deviceId: 'd1', platform: 'telegram', version: 0 });
  });

  it('save opt-locks on {deviceId, platform, version-1}', async () => {
    const model = fakeModel({ findOneAndUpdate: { _id: 'q1' } });
    await createMongoDeviceQueueRepo({ model }).save(queue({ version: 2 }));
    expect(model.calls[0].filter).toEqual({ tenantId: 'default', deviceId: 'd1', platform: 'telegram', version: 1 });
  });

  it('save throws CONFLICT when no row matched', async () => {
    const model = fakeModel({ findOneAndUpdate: null });
    await expect(createMongoDeviceQueueRepo({ model }).save(queue())).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
