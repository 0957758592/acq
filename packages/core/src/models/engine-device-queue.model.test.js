import mongoose from 'mongoose';
import { EngineDeviceQueue } from './engine-device-queue.model.js';

describe('EngineDeviceQueue model', () => {
  it('validates clean with deviceId + platform and applies defaults', () => {
    const doc = new EngineDeviceQueue({ deviceId: new mongoose.Types.ObjectId(), platform: 'telegram' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.activeSlots).toBe(1);
    expect(doc.targetDepth).toBe(3);
    expect(doc.version).toBe(0);
    expect(doc.activeAccountIds.toObject()).toEqual([]);
  });

  it('requires deviceId and platform', () => {
    expect(new EngineDeviceQueue({}).validateSync()).toBeDefined();
    expect(new EngineDeviceQueue({ deviceId: new mongoose.Types.ObjectId() }).validateSync()).toBeDefined();
  });

  it('enforces a unique index on {deviceId, platform}', () => {
    const unique = EngineDeviceQueue.schema
      .indexes()
      .some(([f, o]) => f.deviceId === 1 && f.platform === 1 && o?.unique);
    expect(unique).toBe(true);
  });
});
