import { REPORT_STRATEGIES, reportTaskKey, expandReportTasks } from './strategy.js';

const campaign = {
  id: 'c1',
  targets: ['+491700000001', '+491700000002'],
  strategy: 'all-accounts-report-each-target'
};

describe('report strategy', () => {
  it('exposes the supported strategies', () => {
    expect(REPORT_STRATEGIES).toEqual([
      'all-accounts-report-each-target',
      'one-target-per-account'
    ]);
  });

  it('builds a stable exactly-once key per (campaign, account, target)', () => {
    const key = reportTaskKey({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' });
    expect(key).toBe('c1:a1:+491700000001');
  });

  it('all-accounts-report-each-target = cross product', () => {
    const tasks = expandReportTasks({ campaign, onlineAccountIds: ['a1', 'a2'] });
    expect(tasks).toHaveLength(4);
    expect(tasks).toContainEqual({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' });
    expect(tasks).toContainEqual({ campaignId: 'c1', accountId: 'a2', targetMsisdn: '+491700000002' });
  });

  it('one-target-per-account round-robins targets across accounts', () => {
    const tasks = expandReportTasks({
      campaign: { ...campaign, strategy: 'one-target-per-account' },
      onlineAccountIds: ['a1', 'a2', 'a3']
    });
    expect(tasks).toEqual([
      { campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' },
      { campaignId: 'c1', accountId: 'a2', targetMsisdn: '+491700000002' },
      { campaignId: 'c1', accountId: 'a3', targetMsisdn: '+491700000001' }
    ]);
  });

  it('excludes already-done (account,target) pairs', () => {
    const tasks = expandReportTasks({
      campaign,
      onlineAccountIds: ['a1'],
      doneKeys: new Set(['c1:a1:+491700000001'])
    });
    expect(tasks).toEqual([
      { campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000002' }
    ]);
  });
});
