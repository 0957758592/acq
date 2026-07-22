import { EngineDevice, PROVIDERS } from './engine-device.model.js';

describe('EngineDevice PROVIDERS enum', () => {
  test('includes every device provider with a built adapter', () => {
    expect(PROVIDERS).toEqual(expect.arrayContaining(['vmos', 'duoplus', 'geelark']));
  });

  test('carries tenantId for multi-tenancy (TZ §12.2/§14.2)', () => {
    const doc = new EngineDevice({ providerDeviceId: 'd1' });
    expect(doc.tenantId).toBe('default');
  });
});
