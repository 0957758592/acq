import { filterAccounts, accountsViewModel } from './accounts.js';

const accounts = [
  { id: 'a1', platform: 'telegram', identifier: '@t1', status: 'online', assignedDeviceId: 'd1', tags: ['vip'], score: 80 },
  { id: 'a2', platform: 'telegram', identifier: '@t2', status: 'banned', assignedDeviceId: 'd1', tags: [], score: 10 },
  { id: 'a3', platform: 'discord', identifier: 'x@e.com', status: 'online', assignedDeviceId: null, tags: ['vip'], score: 60 }
];

describe('filterAccounts', () => {
  test('filters by platform', () => {
    expect(filterAccounts(accounts, { platform: 'discord' }).map((a) => a.id)).toEqual(['a3']);
  });
  test('filters by status', () => {
    expect(filterAccounts(accounts, { status: 'online' }).map((a) => a.id)).toEqual(['a1', 'a3']);
  });
  test('filters by tag', () => {
    expect(filterAccounts(accounts, { tag: 'vip' }).map((a) => a.id)).toEqual(['a1', 'a3']);
  });
  test('filters by minimum score', () => {
    expect(filterAccounts(accounts, { minScore: 50 }).map((a) => a.id)).toEqual(['a1', 'a3']);
  });
  test('combines filters', () => {
    expect(filterAccounts(accounts, { platform: 'telegram', status: 'online' }).map((a) => a.id)).toEqual(['a1']);
  });
});

describe('accountsViewModel', () => {
  test('summarizes totals, per-status counts and rows', () => {
    const vm = accountsViewModel(accounts);
    expect(vm.total).toBe(3);
    expect(vm.byStatus).toEqual({ online: 2, banned: 1 });
    expect(vm.rows[0]).toMatchObject({ id: 'a1', platform: 'telegram', status: 'online', device: 'd1' });
  });

  test('applies filters before summarizing', () => {
    const vm = accountsViewModel(accounts, { status: 'online' });
    expect(vm.total).toBe(2);
    expect(vm.byStatus).toEqual({ online: 2 });
  });
});
