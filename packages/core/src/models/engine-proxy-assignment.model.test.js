import mongoose from 'mongoose';
import { EngineProxyAssignment } from './engine-proxy-assignment.model.js';

describe('EngineProxyAssignment model (sticky 1:1 device<->proxy)', () => {
  it('validates clean with deviceId and proxyId', () => {
    const doc = new EngineProxyAssignment({
      deviceId: new mongoose.Types.ObjectId(),
      proxyId: new mongoose.Types.ObjectId()
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('requires deviceId and proxyId', () => {
    expect(new EngineProxyAssignment({}).validateSync()).toBeDefined();
  });

  it('enforces a unique index on deviceId (one proxy per device)', () => {
    const hasUniqueDevice = EngineProxyAssignment.schema
      .indexes()
      .some(([fields, options]) => fields.deviceId === 1 && options?.unique);
    expect(hasUniqueDevice).toBe(true);
  });
});
