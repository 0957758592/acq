import { canDeviceAcceptAccount } from './device-account-eligibility.js';

const vmos = (over = {}) => ({ provider: 'vmos', providerDeviceId: 'PAD', capacity: { maxAccounts: 1, occupiedAccountIds: [] }, ...over });
const duoplus = (over = {}) => ({ provider: 'duoplus', providerDeviceId: 'D', providerMeta: { subscriptionVerified: true, subscriptionStatus: 'active' }, capacity: { maxAccounts: 1, occupiedAccountIds: [] }, ...over });

describe('canDeviceAcceptAccount', () => {
  it('accepts a fresh non-duoplus device', () => {
    expect(canDeviceAcceptAccount(vmos()).ok).toBe(true);
  });

  it('rejects a missing device', () => {
    expect(canDeviceAcceptAccount(null)).toMatchObject({ ok: false, code: 'DEVICE_NOT_FOUND' });
  });

  it('gates duoplus on a verified active subscription', () => {
    expect(canDeviceAcceptAccount(duoplus()).ok).toBe(true);
    expect(canDeviceAcceptAccount(duoplus({ providerMeta: { subscriptionVerified: false } }))).toMatchObject({ ok: false, code: 'DEVICE_SUBSCRIPTION_REQUIRED' });
  });

  it('enforces the multi-account capacity cap (§5.11) using occupiedAccountIds', () => {
    // 1:1 by default -> a device already hosting one account is full.
    expect(canDeviceAcceptAccount(vmos({ capacity: { maxAccounts: 1, occupiedAccountIds: ['a1'] } }))).toMatchObject({ ok: false, code: 'DEVICE_CAPACITY_FULL' });
  });

  it('honors a platform maxAccountsPerDevice > 1 (instagram 5:1)', () => {
    const dev = vmos({ capacity: { maxAccounts: 1, occupiedAccountIds: ['a1', 'a2', 'a3'] } });
    // instagram allows 5 per device -> 3 occupied is still acceptable.
    expect(canDeviceAcceptAccount(dev, 'instagram', { maxAccountsPerDevice: 5 }).ok).toBe(true);
    // the same device is full at 5.
    const full = vmos({ capacity: { maxAccounts: 1, occupiedAccountIds: ['a1', 'a2', 'a3', 'a4', 'a5'] } });
    expect(canDeviceAcceptAccount(full, 'instagram', { maxAccountsPerDevice: 5 })).toMatchObject({ ok: false, code: 'DEVICE_CAPACITY_FULL' });
  });

  it('falls back to the scalar activeAccountCount when occupiedAccountIds is absent', () => {
    expect(canDeviceAcceptAccount({ provider: 'vmos', capacity: { maxAccounts: 2, activeAccountCount: 2 } })).toMatchObject({ ok: false, code: 'DEVICE_CAPACITY_FULL' });
  });
});
