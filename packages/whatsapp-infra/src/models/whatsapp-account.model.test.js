import { WhatsappAccount, ACCOUNT_STATUSES } from './whatsapp-account.model.js';
describe('WhatsappAccount model', () => {
  it('requires msisdn and defaults status/version', () => {
    const doc = new WhatsappAccount({ msisdn: '+491701234567', source: 'dark_shopping' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe('purchased');
    expect(doc.version).toBe(0);
    expect(doc.assignedDeviceId).toBeNull();
  });
  it('rejects an unknown status', () => {
    const doc = new WhatsappAccount({ msisdn: '+491701234567', status: 'bogus' });
    expect(doc.validateSync()).toBeDefined();
  });
  it('exposes the status enum', () => {
    expect(ACCOUNT_STATUSES).toContain('online');
  });
  it('defaults metadata to an empty object', () => {
    expect(new WhatsappAccount({ msisdn: '+491701234567' }).metadata).toEqual({});
  });
});
