import { reportTaskKey } from '@acq/whatsapp';
import { createMongoReportRepo } from './mongo-report-repo.js';

function fakeCampaignModel(returns = {}) {
  const calls = [];
  return {
    calls,
    findById: (id) => { calls.push({ findById: id }); return { lean: () => (returns.findById ?? null) }; },
    find: (filter) => { calls.push({ findFilter: filter }); return { lean: () => (returns.find ?? []) }; },
    create: (doc) => { calls.push({ create: doc }); return returns.create ?? doc; },
    findByIdAndUpdate: (id, update, options) => {
      calls.push({ findByIdAndUpdate: { id, update, options } });
      return { lean: () => (returns.findByIdAndUpdate ?? null) };
    }
  };
}
function fakeTaskModel(returns = {}) {
  const calls = [];
  return {
    calls,
    find: (filter) => { calls.push({ findFilter: filter }); return { lean: () => (returns.find ?? []) }; },
    findOneAndUpdate: (filter, update, options) => { calls.push({ filter, update, options }); return returns.findOneAndUpdate; },
    exists: (filter) => { calls.push({ existsFilter: filter }); return returns.exists ?? null; }
  };
}

describe('MongoReportRepo', () => {
  it('findCampaign loads a campaign by id (lean)', async () => {
    const campaignModel = fakeCampaignModel({ findById: { id: 'c1' } });
    const repo = createMongoReportRepo({ campaignModel, taskModel: fakeTaskModel() });
    const found = await repo.findCampaign('c1');
    expect(campaignModel.calls[0].findById).toBe('c1');
    expect(found).toEqual({ id: 'c1' });
  });

  it('listActiveCampaigns filters on status active (lean)', async () => {
    const campaignModel = fakeCampaignModel({ find: [{ id: 'c1' }] });
    const repo = createMongoReportRepo({ campaignModel, taskModel: fakeTaskModel() });
    const list = await repo.listActiveCampaigns();
    expect(campaignModel.calls[0].findFilter).toEqual({ status: 'active' });
    expect(list).toEqual([{ id: 'c1' }]);
  });

  it('doneKeys returns a Set of domain reportTaskKey strings', async () => {
    const task = { campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001', status: 'done' };
    const taskModel = fakeTaskModel({ find: [task] });
    const repo = createMongoReportRepo({ campaignModel: fakeCampaignModel(), taskModel });
    const keys = await repo.doneKeys('c1');
    expect(taskModel.calls[0].findFilter).toEqual({ campaignId: 'c1', status: 'done' });
    expect(keys).toBeInstanceOf(Set);
    expect(keys.has(reportTaskKey({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' }))).toBe(true);
  });

  it('upsertTask is exactly-once: upsert + $setOnInsert on the unique triple', async () => {
    const taskModel = fakeTaskModel({ findOneAndUpdate: { _id: 't1' } });
    const repo = createMongoReportRepo({ campaignModel: fakeCampaignModel(), taskModel });
    await repo.upsertTask({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' });
    const { filter, update, options } = taskModel.calls[0];
    expect(filter).toEqual({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' });
    expect(update.$setOnInsert.status).toBe('pending');
    expect(update.$setOnInsert.campaignId).toBe('c1');
    expect(options).toEqual({ upsert: true, new: true });
  });

  it('createCampaign creates an active campaign with targets+strategy', async () => {
    const campaignModel = fakeCampaignModel({ create: { _id: 'c1' } });
    const repo = createMongoReportRepo({ campaignModel, taskModel: fakeTaskModel() });
    const created = await repo.createCampaign({ targets: ['+491700000001'], strategy: 'one-target-per-account' });
    expect(campaignModel.calls[0].create).toEqual({
      targets: ['+491700000001'], strategy: 'one-target-per-account', status: 'active'
    });
    expect(created).toEqual({ _id: 'c1' });
  });

  it('setCampaignStatus updates status by id ($set, new, lean)', async () => {
    const campaignModel = fakeCampaignModel({ findByIdAndUpdate: { _id: 'c1', status: 'paused' } });
    const repo = createMongoReportRepo({ campaignModel, taskModel: fakeTaskModel() });
    const updated = await repo.setCampaignStatus('c1', 'paused');
    const { id, update, options } = campaignModel.calls[0].findByIdAndUpdate;
    expect(id).toBe('c1');
    expect(update).toEqual({ $set: { status: 'paused' } });
    expect(options).toEqual({ new: true });
    expect(updated).toEqual({ _id: 'c1', status: 'paused' });
  });

  it('hasOpenTasks returns true when an open task exists (filters status $ne done)', async () => {
    const taskModel = fakeTaskModel({ exists: { _id: 't1' } });
    const repo = createMongoReportRepo({ campaignModel: fakeCampaignModel(), taskModel });
    const open = await repo.hasOpenTasks('c1');
    expect(taskModel.calls[0].existsFilter).toEqual({ campaignId: 'c1', status: { $ne: 'done' } });
    expect(open).toBe(true);
  });

  it('hasOpenTasks returns false when no open task exists (exists null)', async () => {
    const taskModel = fakeTaskModel({ exists: null });
    const repo = createMongoReportRepo({ campaignModel: fakeCampaignModel(), taskModel });
    const open = await repo.hasOpenTasks('c1');
    expect(taskModel.calls[0].existsFilter).toEqual({ campaignId: 'c1', status: { $ne: 'done' } });
    expect(open).toBe(false);
  });

  it('markTask sets status/lastError and increments attempts', async () => {
    const taskModel = fakeTaskModel({ findOneAndUpdate: { _id: 't1' } });
    const repo = createMongoReportRepo({ campaignModel: fakeCampaignModel(), taskModel });
    await repo.markTask('t1', 'failed', 'boom');
    const { filter, update, options } = taskModel.calls[0];
    expect(filter).toEqual({ _id: 't1' });
    expect(update.$set).toEqual({ status: 'failed', lastError: 'boom' });
    expect(update.$inc).toEqual({ attempts: 1 });
    expect(options).toEqual({ new: true });
  });
});
