import { createAccount, assignToDevice, transition, recordProbe } from './account.js';

const clock = () => new Date('2026-07-09T00:00:00.000Z');

function baseAccount(overrides = {}) {
  return createAccount({
    id: 'a1',
    msisdn: '+491701234567',
    source: 'dark_shopping',
    secretRefs: { session: 'keychain:wa-a1' },
    ...overrides
  }, { clock });
}

describe('WhatsappAccount', () => {
  it('starts purchased and unassigned', () => {
    const acc = baseAccount();
    expect(acc.status).toBe('purchased');
    expect(acc.assignedDeviceId).toBeNull();
    expect(acc.version).toBe(0);
  });

  it('assigns to a device and moves purchased -> assigned', () => {
    const acc = transition(assignToDevice(baseAccount(), 'd1'), 'assigned', { clock });
    expect(acc.assignedDeviceId).toBe('d1');
    expect(acc.status).toBe('assigned');
    expect(acc.version).toBe(2);
  });

  it('refuses to go online without an assigned device', () => {
    const acc = baseAccount();
    expect(() => transition(acc, 'online', { clock }))
      .toThrow('ACCOUNT_TRANSITION_INVALID');
  });

  it('rejects an illegal transition', () => {
    expect(() => transition(baseAccount(), 'online', { clock }))
      .toThrow('ACCOUNT_TRANSITION_INVALID');
  });

  it('records a probe failure and bumps consecutiveFailures', () => {
    const acc = recordProbe(baseAccount(), { healthy: false }, { clock });
    expect(acc.health.consecutiveFailures).toBe(1);
    expect(acc.health.lastProbeAt).toBe('2026-07-09T00:00:00.000Z');
  });

  it('resets consecutiveFailures on a healthy probe', () => {
    let acc = recordProbe(baseAccount(), { healthy: false }, { clock });
    acc = recordProbe(acc, { healthy: true }, { clock });
    expect(acc.health.consecutiveFailures).toBe(0);
  });
});
