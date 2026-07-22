import { enrollDevice } from './device-enroll.js';

function fakeDeviceModel() {
  const calls = [];
  return {
    calls,
    findOneAndUpdate: async (filter, update, opts) => {
      calls.push({ filter, update, opts });
      return { _id: 'dev-1', ...update.$set };
    }
  };
}

describe('device-enroll service (generic, verify-by-fact)', () => {
  it('enrolls an operator-managed device when no provider is wired', async () => {
    const deviceModel = fakeDeviceModel();
    const res = await enrollDevice({ deviceModel, provider: null }, { provider: 'vmos', providerDeviceId: 'PAD-9', name: 'a', region: 'us', capacity: { maxAccounts: 5 } });
    expect(res).toMatchObject({ deviceId: 'dev-1', providerDeviceId: 'PAD-9', provider: 'vmos', status: 'stopped' });
    expect(deviceModel.calls[0].filter).toEqual({ providerDeviceId: 'PAD-9' });
    expect(deviceModel.calls[0].update.$set.capacity).toEqual({ maxAccounts: 5 });
    expect(deviceModel.calls[0].opts.upsert).toBe(true);
  });

  it('verifies existence at the wired provider and stores the raw descriptor', async () => {
    const deviceModel = fakeDeviceModel();
    const provider = { type: 'vmos', describeInstance: async () => ({ padCode: 'PAD-9', status: 3 }) };
    const res = await enrollDevice({ deviceModel, provider }, { provider: 'vmos', providerDeviceId: 'PAD-9' });
    expect(res.deviceId).toBe('dev-1');
    expect(deviceModel.calls[0].update.$set.providerMeta).toMatchObject({ padCode: 'PAD-9' });
  });

  it('fails safe when the device does not exist at the provider (no phantom enrollment)', async () => {
    const deviceModel = fakeDeviceModel();
    const provider = { type: 'vmos', describeInstance: async () => null };
    await expect(enrollDevice({ deviceModel, provider }, { provider: 'vmos', providerDeviceId: 'PAD-X' }))
      .rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND_AT_PROVIDER' });
    expect(deviceModel.calls).toHaveLength(0);
  });

  it('requires a providerDeviceId', async () => {
    await expect(enrollDevice({ deviceModel: fakeDeviceModel(), provider: null }, { provider: 'vmos' }))
      .rejects.toMatchObject({ code: 'PROVIDER_DEVICE_ID_REQUIRED' });
  });
});
