import { createMongoProxyRepo } from './mongo-proxy-repo.js';

function fakeModel() {
  const calls = [];
  return {
    calls,
    find: (q) => ({ lean: async () => { calls.push(['find', q]); return [{ _id: 'p1', ...q }]; } }),
    findOne: (q) => ({ lean: async () => { calls.push(['findOne', q]); return { _id: 'p1', ...q }; } }),
    findOneAndUpdate: async (q, u) => { calls.push(['update', q, u]); return { toObject: () => ({ _id: q._id, ...u.$set, version: (q.version ?? 0) + 1 }) }; }
  };
}

describe('createMongoProxyRepo', () => {
  it('scopes every read/write by tenantId', async () => {
    const model = fakeModel();
    const repo = createMongoProxyRepo({ model, tenantId: 't1' });
    await repo.list({ status: 'available' });
    await repo.findByDevice('d1');
    expect(model.calls[0][1]).toMatchObject({ tenantId: 't1', status: 'available' });
    expect(model.calls[1][1]).toMatchObject({ tenantId: 't1', assignedDeviceId: 'd1' });
  });

  it('findAvailable filters status=available and optional geo', async () => {
    const model = fakeModel();
    const repo = createMongoProxyRepo({ model });
    await repo.findAvailable({ geo: 'us' });
    expect(model.calls[0][1]).toMatchObject({ status: 'available', geo: 'us' });
  });

  it('save is optimistic-locked on version and bumps it', async () => {
    const model = fakeModel();
    const repo = createMongoProxyRepo({ model });
    const out = await repo.save({ _id: 'p1', version: 2, status: 'assigned', assignedDeviceId: 'd1', health: { ok: true } });
    expect(model.calls[0][1]).toMatchObject({ _id: 'p1', version: 2 });
    expect(model.calls[0][2].$inc).toEqual({ version: 1 });
    expect(out).toMatchObject({ status: 'assigned', assignedDeviceId: 'd1', version: 3 });
  });

  it('save throws a conflict when the version no longer matches', async () => {
    const model = { findOneAndUpdate: async () => null };
    const repo = createMongoProxyRepo({ model });
    await expect(repo.save({ _id: 'p1', version: 9, status: 'assigned' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
