import { campaignsViewModel } from './campaigns.js';
describe('campaignsViewModel', () => {
  test('rows + per-status counts', () => {
    const vm = campaignsViewModel([
      { _id: 'c1', platform: 'telegram', actionType: 'report', status: 'active', strategy: 'all-accounts-per-target', targets: ['@a', '@b'] },
      { _id: 'c2', platform: 'instagram', actionType: 'follow', status: 'stopped', targets: ['@x'] }
    ]);
    expect(vm.total).toBe(2);
    expect(vm.byStatus).toEqual({ active: 1, stopped: 1 });
    expect(vm.rows[0]).toMatchObject({ platform: 'telegram', actionType: 'report', targetCount: 2 });
  });
});
