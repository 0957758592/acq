import { devicesViewModel } from './devices.js';
const devices = [
  { _id: 'd1', provider: 'duoplus', providerDeviceId: 'BzSfu', status: 'running', capacity: { maxAccounts: 5, activeAccountCount: 2 }, providerMeta: { subscriptionVerified: true } },
  { _id: 'd2', provider: 'vmos', providerDeviceId: 'PAD-2', status: 'stopped', capacity: { maxAccounts: 1, occupiedAccountIds: ['a1'] } }
];
describe('devicesViewModel', () => {
  test('summarizes per-status counts + aggregate capacity + rows', () => {
    const vm = devicesViewModel(devices);
    expect(vm.total).toBe(2);
    expect(vm.byStatus).toEqual({ running: 1, stopped: 1 });
    expect(vm.capacity).toEqual({ max: 6, active: 3 });
    expect(vm.rows[0]).toMatchObject({ provider: 'duoplus', providerDeviceId: 'BzSfu', activeAccounts: 2, subscriptionVerified: true });
    expect(vm.rows[1].activeAccounts).toBe(1); // from occupiedAccountIds length
  });
});
