import { DuoplusCloudPhoneProvider } from '../provider.js';

// DuoPlus powerOn/powerOff return per-device success/fail arrays; a device that
// can't boot (e.g. expired lease) lands in `fail` with a reason. The provider
// must surface that as a coded seam — never report success for a device that
// actually failed (verify-by-fact).
const fakeClient = (powerOnResult) => ({
  powerOn: async () => powerOnResult,
  powerOff: async () => ({ code: 200, data: { success: [], fail: ['BzSfu'], fail_reason: { BzSfu: 'stopped already' } } })
});

describe('DuoplusCloudPhoneProvider.startDevice — honest power-on', () => {
  it('returns success when the vendor reports the device booted', async () => {
    const provider = new DuoplusCloudPhoneProvider({ client: fakeClient({ code: 200, data: { success: ['BzSfu'], fail: [] } }) });
    const res = await provider.startDevice('BzSfu');
    expect(res.success).toBe(true);
  });

  it('surfaces a coded DEVICE_POWER_ON_FAILED with the reason when the device is in `fail` (expired)', async () => {
    const provider = new DuoplusCloudPhoneProvider({
      client: fakeClient({ code: 200, data: { success: [], fail: ['BzSfu'], fail_reason: { BzSfu: 'The cloud phone has expired.' } } })
    });
    await expect(provider.startDevice('BzSfu')).rejects.toMatchObject({ code: 'DEVICE_POWER_ON_FAILED' });
    await provider.startDevice('BzSfu').catch((e) => {
      expect(e.message).toMatch(/expired/i);
    });
  });

  it('surfaces a coded DEVICE_POWER_OFF_FAILED when a stop fails on the device', async () => {
    const provider = new DuoplusCloudPhoneProvider({ client: fakeClient({ code: 200, data: { success: ['BzSfu'], fail: [] } }) });
    await expect(provider.stopDevice('BzSfu')).rejects.toMatchObject({ code: 'DEVICE_POWER_OFF_FAILED' });
  });
});
