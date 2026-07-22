import { createMongoCampaignRepo } from './mongo-campaign-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    create: async (doc) => { calls.push({ create: doc }); return { _id: 'c1', ...doc }; },
    findOne: (filter) => { calls.push({ findOne: filter }); return { lean: async () => returns.findOne ?? null }; },
    find: (filter) => { calls.push({ find: filter }); return { lean: async () => returns.find ?? [] }; },
    findOneAndUpdate: (filter, update) => { calls.push({ filter, update }); return { lean: async () => ({ _id: 'c1', ...update.$set }) }; }
  };
}

describe('createMongoCampaignRepo (tenant-scoped)', () => {
  it('createCampaign inserts with tenant + active status default kept', async () => {
    const model = fakeModel();
    const repo = createMongoCampaignRepo({ model, tenantId: 't1' });
    await repo.createCampaign({ platform: 'telegram', actionType: 'follow', targets: ['@x'], status: 'active' });
    expect(model.calls[0].create).toMatchObject({ tenantId: 't1', platform: 'telegram', actionType: 'follow' });
  });

  it('listActiveCampaigns scopes by tenant + status active + platform', async () => {
    const model = fakeModel({ find: [{ _id: 'c1', platform: 'telegram', status: 'active' }] });
    const repo = createMongoCampaignRepo({ model });
    const rows = await repo.listActiveCampaigns('telegram');
    expect(rows).toHaveLength(1);
    expect(model.calls[0].find).toEqual({ tenantId: 'default', status: 'active', platform: 'telegram' });
  });

  it('setCampaignStatus updates scoped by tenant + id', async () => {
    const model = fakeModel();
    const repo = createMongoCampaignRepo({ model });
    await repo.setCampaignStatus('c1', 'paused');
    expect(model.calls[0].filter).toEqual({ _id: 'c1', tenantId: 'default' });
    expect(model.calls[0].update.$set.status).toBe('paused');
  });
});
