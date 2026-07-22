import { createMongoActionTaskRepo } from './mongo-action-task-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    findOneAndUpdate: (filter, update, options) => {
      calls.push({ filter, update, options });
      return returns.findOneAndUpdate ?? { _id: 't1' };
    },
    find: (filter) => {
      calls.push({ find: filter });
      return { lean: () => returns.find ?? [] };
    },
    countDocuments: (filter) => {
      calls.push({ count: filter });
      return returns.count ?? 0;
    }
  };
}

const task = { campaignId: 'c1', accountId: 'a1', target: 't1', actionType: 'follow' };

describe('MongoActionTaskRepo.upsertTask (exactly-once)', () => {
  it('upserts with $setOnInsert on the natural key', async () => {
    const model = fakeModel();
    await createMongoActionTaskRepo({ model }).upsertTask(task);
    const { filter, update, options } = model.calls[0];
    expect(filter).toEqual(task);
    expect(options).toMatchObject({ upsert: true });
    expect(update.$setOnInsert).toMatchObject({ status: 'pending', attempts: 0 });
  });
});

describe('MongoActionTaskRepo.markTask', () => {
  it('sets status and increments attempts on the natural key', async () => {
    const model = fakeModel();
    await createMongoActionTaskRepo({ model }).markTask(task, 'done');
    const { filter, update } = model.calls[0];
    expect(filter).toEqual(task);
    expect(update.$set.status).toBe('done');
    expect(update.$inc.attempts).toBe(1);
  });
});

describe('MongoActionTaskRepo.doneKeys', () => {
  it('returns actionTaskKeys of done tasks', async () => {
    const model = fakeModel({
      find: [{ campaignId: 'c1', accountId: 'a1', target: 't1', actionType: 'follow' }]
    });
    const keys = await createMongoActionTaskRepo({ model }).doneKeys('c1');
    expect(keys).toEqual(['c1:a1:t1:follow']);
    expect(model.calls[0].find).toMatchObject({ campaignId: 'c1', status: 'done' });
  });
});

describe('MongoActionTaskRepo.hasOpenTasks', () => {
  it('is true when pending/running tasks remain', async () => {
    const model = fakeModel({ count: 2 });
    expect(await createMongoActionTaskRepo({ model }).hasOpenTasks('c1')).toBe(true);
    expect(model.calls[0].count).toMatchObject({ campaignId: 'c1', status: { $in: ['pending', 'running'] } });
  });
  it('is false when none remain', async () => {
    const model = fakeModel({ count: 0 });
    expect(await createMongoActionTaskRepo({ model }).hasOpenTasks('c1')).toBe(false);
  });
});
