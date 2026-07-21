import {
  ACCOUNT_STATUSES,
  canTransition,
  assertTransition
} from './status.js';

describe('account status transitions', () => {
  it('lists all statuses', () => {
    expect(ACCOUNT_STATUSES).toEqual([
      'purchased', 'assigned', 'bringing_online',
      'online', 'cooldown', 'banned', 'retired'
    ]);
  });

  it('allows purchased -> assigned', () => {
    expect(canTransition('purchased', 'assigned')).toBe(true);
  });

  it('forbids purchased -> online', () => {
    expect(canTransition('purchased', 'online')).toBe(false);
  });

  it('allows online <-> cooldown', () => {
    expect(canTransition('online', 'cooldown')).toBe(true);
    expect(canTransition('cooldown', 'online')).toBe(true);
  });

  it('allows banned -> retired but retired is terminal', () => {
    expect(canTransition('banned', 'retired')).toBe(true);
    expect(canTransition('retired', 'assigned')).toBe(false);
  });

  it('assertTransition throws a coded error on invalid move', () => {
    expect(() => assertTransition('purchased', 'online'))
      .toThrow('ACCOUNT_TRANSITION_INVALID');
  });
});
