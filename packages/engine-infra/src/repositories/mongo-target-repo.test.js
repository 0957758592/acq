import { createMongoTargetRepo } from './mongo-target-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    bulkWrite: (ops) => { calls.push({ bulkWrite: ops }); return returns.bulkWrite ?? { upsertedCount: ops.length, matchedCount: 0 }; },
    find: (filter) => { calls.push({ find: filter }); return { sort: () => ({ limit: () => ({ lean: () => returns.find ?? [] }) }) }; },
    findOne: (filter) => { calls.push({ findOne: filter }); return { lean: () => returns.findOne ?? null }; },
    findOneAndUpdate: (filter, update, options) => { calls.push({ filter, update, options }); return returns.findOneAndUpdate ?? { _id: 't1' }; }
  };
}

const clock = { now: () => new Date('2026-08-08T00:00:00Z') };

test('upsertMany upserts by the natural (tenant,platform,targetType,identifier) key', async () => {
  const model = fakeModel();
  const repo = createMongoTargetRepo({ model, clock });
  const res = await repo.upsertMany([
    { platform: 'instagram', targetType: 'profile', identifier: '@nike', source: 'scrape', metadata: { followers: 100 } }
  ]);
  expect(res.upserted).toBe(1);
  const op = model.calls[0].bulkWrite[0].updateOne;
  expect(op.filter).toEqual({ tenantId: 'default', platform: 'instagram', targetType: 'profile', identifier: '@nike' });
  expect(op.upsert).toBe(true);
  expect(op.update.$set).toMatchObject({ source: 'scrape', metadata: { followers: 100 }, lastSeenAt: clock.now() });
  expect(op.update.$setOnInsert).toMatchObject({ status: 'new', version: 0 });
});

test('upsertMany on an empty batch does no write', async () => {
  const model = fakeModel();
  const repo = createMongoTargetRepo({ model, clock });
  expect(await repo.upsertMany([])).toEqual({ upserted: 0 });
  expect(model.calls).toHaveLength(0);
});

test('page scopes to tenant and applies platform/status/minScore/tag/cursor filters', async () => {
  const model = fakeModel({ find: [{ _id: 'a' }] });
  const repo = createMongoTargetRepo({ model, clock });
  await repo.page({ platform: 'tiktok', status: 'new', minScore: 0.5, tag: 'fitness' }, { cursor: 'c1', limit: 25 });
  expect(model.calls[0].find).toEqual({
    tenantId: 'default', platform: 'tiktok', status: 'new', score: { $gte: 0.5 }, tags: 'fitness', _id: { $gt: 'c1' }
  });
});

test('get resolves by natural key (or by id)', async () => {
  const model = fakeModel({ findOne: { _id: 't1', identifier: '@nike' } });
  const repo = createMongoTargetRepo({ model, clock });
  await repo.get({ platform: 'instagram', targetType: 'profile', identifier: '@nike' });
  expect(model.calls[0].findOne).toEqual({ tenantId: 'default', platform: 'instagram', targetType: 'profile', identifier: '@nike' });
  await repo.get({ id: 't1' });
  expect(model.calls[1].findOne).toEqual({ tenantId: 'default', _id: 't1' });
});

test('patch sets status/score, adds/removes tags, merges metadata and bumps version', async () => {
  const model = fakeModel();
  const repo = createMongoTargetRepo({ model, clock });
  await repo.patch({ id: 't1' }, { status: 'queued', score: 0.8, addTags: ['a'], removeTags: ['b'], metadataMerge: { niche: 'sport' } });
  const { filter, update } = model.calls[0];
  expect(filter).toEqual({ tenantId: 'default', _id: 't1' });
  expect(update.$set).toMatchObject({ status: 'queued', score: 0.8, 'metadata.niche': 'sport' });
  expect(update.$addToSet.tags).toEqual({ $each: ['a'] });
  expect(update.$pull.tags).toEqual({ $in: ['b'] });
  expect(update.$inc).toEqual({ version: 1 });
});
