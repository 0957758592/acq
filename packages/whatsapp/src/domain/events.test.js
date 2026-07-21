import { EVENT_TYPES, accountBanned, queueLow, poolLow, campaignCompleted, reportDone } from './events.js';

const clock = () => new Date('2026-07-09T00:00:00.000Z');

describe('domain events', () => {
  it('lists event types', () => {
    expect(EVENT_TYPES).toEqual([
      'account.banned', 'queue.low', 'pool.low', 'campaign.completed', 'report.done'
    ]);
  });

  it('builds account.banned with payload and timestamp', () => {
    const evt = accountBanned({ accountId: 'a1', deviceId: 'd1' }, { clock });
    expect(evt).toEqual({
      type: 'account.banned',
      occurredAt: '2026-07-09T00:00:00.000Z',
      payload: { accountId: 'a1', deviceId: 'd1' }
    });
  });

  it('builds the remaining events', () => {
    expect(queueLow({ deviceId: 'd1', depth: 1 }, { clock }).type).toBe('queue.low');
    expect(poolLow({ available: 2 }, { clock }).type).toBe('pool.low');
    expect(campaignCompleted({ campaignId: 'c1' }, { clock }).type).toBe('campaign.completed');
    expect(reportDone({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' }, { clock }).type)
      .toBe('report.done');
  });
});
