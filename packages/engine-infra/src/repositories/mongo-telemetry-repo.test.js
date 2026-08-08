import { createMongoTelemetryRepo } from './mongo-telemetry-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    insertMany: (docs, opts) => { calls.push({ insertMany: docs, opts }); return docs; },
    find: (filter) => { calls.push({ find: filter }); return { sort: (s) => { calls.push({ sort: s }); return { limit: () => ({ lean: () => returns.find ?? [] }) }; } } }
  };
}

test('recordMany stamps the tenant and bulk-inserts; empty batch does nothing', async () => {
  const model = fakeModel();
  const repo = createMongoTelemetryRepo({ model });
  expect(await repo.recordMany([])).toEqual({ inserted: 0 });
  expect(model.calls).toHaveLength(0);
  const res = await repo.recordMany([{ platform: 'tiktok', kind: 'scrape.messages', metrics: { itemsOut: 5 } }]);
  expect(res.inserted).toBe(1);
  expect(model.calls[0].insertMany[0]).toMatchObject({ tenantId: 'default', platform: 'tiktok', kind: 'scrape.messages' });
});

test('query scopes to tenant, applies platform/kind/accountId/since filters and sorts most-recent-first', async () => {
  const model = fakeModel({ find: [{ _id: 'e1' }] });
  const repo = createMongoTelemetryRepo({ model });
  const since = new Date('2026-08-01T00:00:00Z');
  const res = await repo.query({ platform: 'instagram', kind: 'action.comment', accountId: 'a1', since }, { limit: 50 });
  expect(model.calls[0].find).toEqual({ tenantId: 'default', platform: 'instagram', kind: 'action.comment', accountId: 'a1', ts: { $gte: since } });
  expect(model.calls[1].sort).toEqual({ ts: -1, _id: -1 });
  expect(res).toEqual([{ _id: 'e1' }]);
});
