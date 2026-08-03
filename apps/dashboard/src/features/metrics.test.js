import { metricsViewModel } from './metrics.js';

describe('metricsViewModel', () => {
  test('one row per platform with pool/online/ban/campaign + device saturation', () => {
    const vm = metricsViewModel([
      { platform: 'telegram', poolAvailable: 4, accountsOnline: 3, accountsBanned: 1, banShare: 0.25, campaignsActive: 2, devices: [{ saturation: 0.5 }, { saturation: 1 }] },
      { platform: 'gmail', poolAvailable: 0, accountsOnline: 0, accountsBanned: 0, banShare: 0, campaignsActive: 0, devices: [] }
    ]);
    expect(vm.total).toBe(2);
    expect(vm.rows[0]).toMatchObject({ platform: 'telegram', poolAvailable: 4, online: 3, banned: 1, campaigns: 2 });
    expect(vm.rows[0].banShare).toBe('25%');
    expect(vm.rows[0].maxSaturation).toBe('100%');
    expect(vm.rows[1].maxSaturation).toBe('—');
  });
});
