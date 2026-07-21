import { WhatsappReportCampaign } from './whatsapp-report-campaign.model.js';
import { REPORT_STRATEGIES } from '@acq/whatsapp';

describe('WhatsappReportCampaign model', () => {
  it('validates clean with a valid strategy and applies defaults', () => {
    const doc = new WhatsappReportCampaign({ strategy: REPORT_STRATEGIES[0] });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe('draft');
    expect(doc.counts.done).toBe(0);
  });
  it('rejects an unknown strategy', () => {
    const doc = new WhatsappReportCampaign({ strategy: 'bogus' });
    expect(doc.validateSync()).toBeDefined();
  });
  it('requires a strategy', () => {
    const doc = new WhatsappReportCampaign({});
    expect(doc.validateSync()).toBeDefined();
  });
});
