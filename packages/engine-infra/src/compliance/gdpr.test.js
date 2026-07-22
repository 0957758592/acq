import { createGdprService } from './gdpr.js';

function fakeModel(deletedCount = 0) {
  const calls = [];
  return {
    calls,
    deleteOne: async (filter) => {
      calls.push({ deleteOne: filter });
      return { deletedCount };
    },
    deleteMany: async (filter) => {
      calls.push({ deleteMany: filter });
      return { deletedCount };
    }
  };
}

describe('createGdprService.deleteAccount', () => {
  it('cascade-deletes the account and its action tasks + proxy assignment + scrape data', async () => {
    const accountModel = fakeModel(1);
    const actionTaskModel = fakeModel(3);
    const proxyAssignmentModel = fakeModel(1);
    const scrapeResultModel = fakeModel(2);
    const audit = { record: [] };
    const svc = createGdprService({
      accountModel,
      actionTaskModel,
      proxyAssignmentModel,
      scrapeResultModel,
      audit: { record: async (e) => audit.record.push(e) }
    });

    const res = await svc.deleteAccount('a1', { tenantId: 't1', identifier: '@bob', actor: 'admin' });

    expect(accountModel.calls[0].deleteOne).toEqual({ _id: 'a1', tenantId: 't1' });
    expect(actionTaskModel.calls[0].deleteMany).toEqual({ accountId: 'a1', tenantId: 't1' });
    expect(scrapeResultModel.calls[0].deleteMany).toEqual({ tenantId: 't1', 'data.handle': '@bob' });
    expect(res.deleted).toMatchObject({ account: 1, actionTasks: 3, scrapeResults: 2 });
    // The erasure itself is audited (immutable trail, §14.7).
    expect(audit.record[0]).toMatchObject({ operation: 'gdpr.deleteAccount', subjectId: 'a1', actor: 'admin' });
  });

  it('works without optional models/audit', async () => {
    const svc = createGdprService({ accountModel: fakeModel(1), actionTaskModel: fakeModel(0) });
    const res = await svc.deleteAccount('a2', {});
    expect(res.deleted.account).toBe(1);
  });
});
