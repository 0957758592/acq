import { can, ROLES } from './rbac.js';
import { getOperation, OPERATIONS } from './operations.js';

describe('ROLES', () => {
  test('defines the four roles', () => {
    expect(ROLES).toEqual(expect.arrayContaining(['admin', 'operator', 'brain', 'readonly']));
  });
});

describe('operations catalog', () => {
  test('every operation declares mutating + roles', () => {
    for (const op of OPERATIONS) {
      expect(typeof op.name).toBe('string');
      expect(typeof op.mutating).toBe('boolean');
      expect(Array.isArray(op.roles)).toBe(true);
    }
  });

  test('getOperation returns a known op and undefined otherwise', () => {
    expect(getOperation('pool.status').name).toBe('pool.status');
    expect(getOperation('nope')).toBeUndefined();
  });
});

describe('can (RBAC)', () => {
  test('admin can do everything', () => {
    expect(can('admin', 'shop.approve')).toBe(true);
    expect(can('admin', 'account.retire')).toBe(true);
  });

  test('readonly can read but not mutate', () => {
    expect(can('readonly', 'pool.status')).toBe(true);
    expect(can('readonly', 'account.retire')).toBe(false);
  });

  test('brain can orchestrate (reconcile, campaigns) but not approve shops', () => {
    expect(can('brain', 'reconcile.now')).toBe(true);
    expect(can('brain', 'campaign.create')).toBe(true);
    expect(can('brain', 'shop.approve')).toBe(false);
  });

  test('unknown operation denies for a non-admin', () => {
    expect(can('operator', 'ghost.op')).toBe(false);
  });
});
