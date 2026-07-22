import { createMongoScrapeResultRepo } from './mongo-scrape-result-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    bulkWrite: async (ops) => {
      calls.push({ bulkWrite: ops });
      return { upsertedCount: ops.length };
    },
    find: (filter) => {
      calls.push({ find: filter });
      return {
        sort: () => ({ limit: () => ({ lean: async () => returns.find ?? [] }) })
      };
    }
  };
}

const entity = (over = {}) => ({
  platform: 'ig',
  type: 'follower',
  target: '@star',
  key: 'ig:follower:@star:@fan1',
  data: { handle: '@fan1' },
  ...over
});

describe('createMongoScrapeResultRepo', () => {
  it('upsertResults writes an idempotent upsert per entity keyed by {tenantId,key}', async () => {
    const model = fakeModel();
    const repo = createMongoScrapeResultRepo({ model });
    await repo.upsertResults([entity(), entity({ key: 'ig:follower:@star:@fan2' })]);
    const ops = model.calls[0].bulkWrite;
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.filter).toMatchObject({ tenantId: 'default', key: 'ig:follower:@star:@fan1' });
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(ops[0].updateOne.update.$set.platform).toBe('ig');
  });

  it('upsertResults is a no-op for an empty list', async () => {
    const model = fakeModel();
    const repo = createMongoScrapeResultRepo({ model });
    await repo.upsertResults([]);
    expect(model.calls).toHaveLength(0);
  });

  it('listResults applies a cursor + limit (cursor pagination)', async () => {
    const model = fakeModel({ find: [{ _id: '1' }, { _id: '2' }] });
    const repo = createMongoScrapeResultRepo({ model });
    const rows = await repo.listResults({ platform: 'ig', type: 'follower' }, { cursor: 'abc', limit: 2 });
    expect(rows).toHaveLength(2);
    expect(model.calls[0].find).toMatchObject({ platform: 'ig', type: 'follower', _id: { $gt: 'abc' } });
  });
});
