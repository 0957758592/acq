import { createAccount, assignToDevice, transition, recordProbe, markCheckpoint } from './account.js';
import { DomainError } from '../errors.js';

const clock = () => new Date('2026-07-22T00:00:00.000Z');

function make(overrides = {}) {
  return createAccount(
    { id: 'a1', platform: 'telegram', identifier: '@user', source: 'purchase', ...overrides },
    { clock }
  );
}

describe('createAccount', () => {
  test('starts in acquired with version 0 and zeroed health', () => {
    const acc = make();
    expect(acc.status).toBe('acquired');
    expect(acc.version).toBe(0);
    expect(acc.platform).toBe('telegram');
    expect(acc.identifier).toBe('@user');
    expect(acc.health).toEqual({ consecutiveFailures: 0, lastProbeAt: null });
    expect(acc.assignedDeviceId).toBeNull();
  });

  test('is frozen (immutable aggregate)', () => {
    expect(Object.isFrozen(make())).toBe(true);
  });
});

describe('assignToDevice', () => {
  test('sets assignedDeviceId and bumps version', () => {
    const acc = assignToDevice(make(), 'dev1');
    expect(acc.assignedDeviceId).toBe('dev1');
    expect(acc.version).toBe(1);
  });

  test('requires a deviceId', () => {
    expect(() => assignToDevice(make(), '')).toThrow(DomainError);
  });
});

describe('transition', () => {
  test('bumps version and updates status on a legal move', () => {
    const acc = transition(make(), 'assigned', { clock });
    expect(acc.status).toBe('assigned');
    expect(acc.version).toBe(1);
  });

  test('online requires an assigned device', () => {
    const assigned = transition(make(), 'assigned', { clock });
    const bringing = transition(assigned, 'bringing_online', { clock });
    try {
      transition(bringing, 'online', { clock });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('ACCOUNT_TRANSITION_INVALID');
    }
  });

  test('online succeeds when a device is assigned', () => {
    let acc = assignToDevice(make(), 'dev1');
    acc = transition(acc, 'assigned', { clock });
    acc = transition(acc, 'bringing_online', { clock });
    acc = transition(acc, 'online', { clock });
    expect(acc.status).toBe('online');
  });
});

describe('recordProbe', () => {
  test('resets consecutiveFailures on a healthy probe', () => {
    const acc = recordProbe(make(), { healthy: true }, { clock });
    expect(acc.health.consecutiveFailures).toBe(0);
    expect(acc.health.lastProbeAt).toBe('2026-07-22T00:00:00.000Z');
  });

  test('increments consecutiveFailures on an unhealthy probe', () => {
    const once = recordProbe(make(), { healthy: false }, { clock });
    const twice = recordProbe(once, { healthy: false }, { clock });
    expect(twice.health.consecutiveFailures).toBe(2);
  });
});

describe('markCheckpoint', () => {
  test('moves an online account to checkpointed with a reason', () => {
    let acc = assignToDevice(make(), 'dev1');
    acc = transition(acc, 'assigned', { clock });
    acc = transition(acc, 'bringing_online', { clock });
    acc = transition(acc, 'online', { clock });
    const cp = markCheckpoint(acc, 'phone-verify', { clock });
    expect(cp.status).toBe('checkpointed');
    expect(cp.checkpointReason).toBe('phone-verify');
  });
});
