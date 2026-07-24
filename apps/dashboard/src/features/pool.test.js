import { poolViewModel } from './pool.js';
describe('poolViewModel', () => {
  test('availability table + total', () => {
    const vm = poolViewModel([{ platform: 'telegram', available: 6 }, { platform: 'instagram', source: 'purchase', available: 3 }]);
    expect(vm.totalAvailable).toBe(9);
    expect(vm.rows[0]).toEqual({ platform: 'telegram', source: 'purchase', available: 6 });
  });
});
