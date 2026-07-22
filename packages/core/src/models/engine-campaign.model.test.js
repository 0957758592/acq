import { EngineCampaign, CAMPAIGN_STATUSES } from './engine-campaign.model.js';

describe('EngineCampaign model', () => {
  it('validates clean with platform + actionType and defaults status draft', () => {
    const doc = new EngineCampaign({ platform: 'telegram', actionType: 'follow' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.tenantId).toBe('default');
    expect(doc.status).toBe('draft');
    expect(doc.version).toBe(0);
  });
  it('requires platform and actionType', () => {
    expect(new EngineCampaign({}).validateSync()).toBeDefined();
  });
  it('rejects an unknown status', () => {
    expect(new EngineCampaign({ platform: 'tg', actionType: 'follow', status: 'nope' }).validateSync()).toBeDefined();
  });
  it('exposes the campaign statuses', () => {
    expect(CAMPAIGN_STATUSES).toEqual(expect.arrayContaining(['draft', 'active', 'paused', 'completed', 'stopped']));
  });
});
