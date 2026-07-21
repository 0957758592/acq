import { ACCOUNT_STATES, canTransition, assertTransition } from './status.js';
import { DomainError } from '../errors.js';

describe('ACCOUNT_STATES (generalized 8-state machine, TZ §3.1)', () => {
  test('has exactly the 8 canonical states', () => {
    expect(ACCOUNT_STATES).toEqual([
      'acquired',
      'assigned',
      'bringing_online',
      'online',
      'cooldown',
      'checkpointed',
      'banned',
      'retired'
    ]);
  });
});

describe('canTransition', () => {
  test.each([
    ['acquired', 'assigned'],
    ['acquired', 'retired'],
    ['assigned', 'bringing_online'],
    ['assigned', 'acquired'],
    ['bringing_online', 'online'],
    ['bringing_online', 'checkpointed'],
    ['online', 'bringing_online'], // re-login after logged_out
    ['online', 'cooldown'],
    ['online', 'checkpointed'],
    ['cooldown', 'online'],
    ['cooldown', 'bringing_online'],
    ['checkpointed', 'bringing_online'], // passed verification -> back online
    ['checkpointed', 'banned'],
    ['banned', 'retired']
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  test.each([
    ['acquired', 'online'],
    ['online', 'assigned'],
    ['banned', 'online'],
    ['retired', 'acquired'],
    ['checkpointed', 'online'] // must re-login (bringing_online), not jump straight
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  test('retired is terminal', () => {
    expect(canTransition('retired', 'assigned')).toBe(false);
  });
});

describe('assertTransition', () => {
  test('throws ACCOUNT_TRANSITION_INVALID on an illegal jump', () => {
    try {
      assertTransition('acquired', 'online');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe('ACCOUNT_TRANSITION_INVALID');
    }
  });

  test('passes a legal transition', () => {
    expect(() => assertTransition('acquired', 'assigned')).not.toThrow();
  });
});
