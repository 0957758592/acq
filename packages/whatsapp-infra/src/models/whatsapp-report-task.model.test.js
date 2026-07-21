import mongoose from 'mongoose';
import { WhatsappReportTask } from './whatsapp-report-task.model.js';

describe('WhatsappReportTask model', () => {
  it('validates clean with campaignId, accountId and targetMsisdn', () => {
    const doc = new WhatsappReportTask({
      campaignId: new mongoose.Types.ObjectId(),
      accountId: new mongoose.Types.ObjectId(),
      targetMsisdn: '+491701234567'
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe('pending');
    expect(doc.attempts).toBe(0);
  });
  it('declares the exactly-once unique compound index', () => {
    const entry = WhatsappReportTask.schema.indexes().find(
      ([key]) =>
        key.campaignId === 1 && key.accountId === 1 && key.targetMsisdn === 1
    );
    expect(entry).toBeDefined();
    expect(entry[1].unique).toBe(true);
  });
});
