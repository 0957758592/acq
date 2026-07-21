import mongoose from 'mongoose';
import { WhatsappDeviceQueue } from './whatsapp-device-queue.model.js';

describe('WhatsappDeviceQueue model', () => {
  it('validates clean with a deviceId and applies defaults', () => {
    const doc = new WhatsappDeviceQueue({ deviceId: new mongoose.Types.ObjectId() });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.activeAccountIds.toObject()).toEqual([]);
    expect(doc.waitingAccountIds.toObject()).toEqual([]);
    expect(doc.version).toBe(0);
    expect(doc.activeSlots).toBe(1);
    expect(doc.targetDepth).toBe(3);
  });
  it('requires a deviceId', () => {
    const doc = new WhatsappDeviceQueue({});
    expect(doc.validateSync()).toBeDefined();
  });
});
