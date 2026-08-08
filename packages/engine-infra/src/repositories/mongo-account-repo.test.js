import { createMongoAccountRepo } from './mongo-account-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    find: (filter) => {
      calls.push({ find: filter });
      return { lean: () => returns.find ?? [] };
    },
    countDocuments: (filter) => {
      calls.push({ count: filter });
      return returns.count ?? 0;
    },
    findOneAndUpdate: (filter, update, options) => {
      calls.push({ filter, update, options });
      return returns.findOneAndUpdate;
    },
    insertMany: (docs, opts) => {
      calls.push({ insertMany: docs, opts });
      return docs;
    }
  };
}

const account = (over = {}) => ({
  id: 'a1',
  platform: 'telegram',
  identifier: '@bob',
  source: 'purchase',
  secretRefs: {},
  status: 'assigned',
  assignedDeviceId: 'd1',
  assignedProxyId: null,
  health: { consecutiveFailures: 0, lastProbeAt: null },
  checkpointReason: null,
  version: 3,
  ...over
});

describe('generic MongoAccountRepo.save (opt-lock)', () => {
  it('matches the pre-bump version + tenant and $sets the bumped fields', async () => {
    const model = fakeModel({ findOneAndUpdate: { _id: 'a1' } });
    const repo = createMongoAccountRepo({ model });
    await repo.save(account({ version: 3 }));
    const { filter, update } = model.calls[0];
    expect(filter).toEqual({ _id: 'a1', tenantId: 'default', version: 2 });
    expect(update.$set.identifier).toBe('@bob');
    expect(update.$set.platform).toBe('telegram');
    expect(update.$set.version).toBe(3);
  });

  it('throws CONFLICT when no row matched the version', async () => {
    const model = fakeModel({ findOneAndUpdate: null });
    const repo = createMongoAccountRepo({ model });
    await expect(repo.save(account())).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('generic MongoAccountRepo.countAvailable', () => {
  it('counts acquired unassigned accounts for a platform+source', async () => {
    const model = fakeModel({ count: 4 });
    const repo = createMongoAccountRepo({ model });
    const n = await repo.countAvailable({ platform: 'telegram', source: 'purchase' });
    expect(n).toBe(4);
    expect(model.calls[0].count).toMatchObject({
      tenantId: 'default',
      status: 'acquired',
      assignedDeviceId: null,
      platform: 'telegram',
      source: 'purchase'
    });
  });

  it('scopes every query to the bound tenant (no cross-tenant leak)', async () => {
    const model = fakeModel({ count: 0 });
    const repo = createMongoAccountRepo({ model, tenantId: 'tenant-A' });
    await repo.find({ platform: 'telegram' });
    await repo.countAvailable({ platform: 'telegram' });
    expect(model.calls[0].find).toMatchObject({ tenantId: 'tenant-A' });
    expect(model.calls[1].count).toMatchObject({ tenantId: 'tenant-A' });
  });

  it('page() returns a cursor-bounded page scoped to the tenant (REQUIREM §2.5)', async () => {
    const q = {};
    const chain = { find: (f) => { q.filter = f; return chain; }, sort: (s) => { q.sort = s; return chain; }, limit: (n) => { q.limit = n; return chain; }, lean: async () => [{ _id: 'a1' }, { _id: 'a2' }] };
    const repo = createMongoAccountRepo({ model: { find: chain.find }, tenantId: 'tenant-Z' });
    const res = await repo.page({ platform: 'telegram' }, { cursor: 'a0', limit: 25 });
    expect(res).toHaveProperty('items');
    expect(res).toHaveProperty('nextCursor');
    expect(q.filter).toMatchObject({ tenantId: 'tenant-Z', platform: 'telegram', _id: { $gt: 'a0' } });
    expect(q.limit).toBe(26); // limit+1
  });

  it('treats a malformed id (CastError) as no match instead of leaking', async () => {
    // Mongoose throws a CastError while casting a non-ObjectId `_id`. A find must
    // resolve to "no rows" (so callers surface a coded NOT_FOUND) — never leak.
    const model = {
      find: () => ({
        lean: () => {
          const err = new Error('Cast to ObjectId failed for value "nope"');
          err.name = 'CastError';
          throw err;
        }
      })
    };
    const repo = createMongoAccountRepo({ model });
    await expect(repo.find({ _id: 'nope' })).resolves.toEqual([]);
  });
});

describe('generic MongoAccountRepo.insertAcquired', () => {
  it('inserts acquired accounts at version 0 with the order id', async () => {
    const model = fakeModel();
    const repo = createMongoAccountRepo({ model });
    await repo.insertAcquired([{ platform: 'telegram', identifier: '@x', source: 'purchase', secretRefs: {} }], {
      orderId: 'ORD-1'
    });
    const { insertMany } = model.calls[0];
    expect(insertMany[0]).toMatchObject({ tenantId: 'default', status: 'acquired', version: 0, identifier: '@x' });
    expect(insertMany[0].acquisition.externalOrderId).toBe('ORD-1');
  });

  it('carries non-secret profile metadata and the session ref (e.g. telegram mtproto)', async () => {
    const model = fakeModel();
    const repo = createMongoAccountRepo({ model });
    await repo.insertAcquired([{
      platform: 'telegram', identifier: '+1450', source: 'purchase', secretRefs: { session: 'vault:s' },
      session: { secretRef: 'vault:s' }, profile: { apiId: 2040, mtproto: true, country: 'CA' }
    }], { orderId: 'ORD-2' });
    const doc = model.calls[0].insertMany[0];
    expect(doc.profile).toEqual({ apiId: 2040, mtproto: true, country: 'CA' });
    expect(doc.session).toEqual({ secretRef: 'vault:s' });
    expect(doc.secretRefs.session).toBe('vault:s');
  });
});
