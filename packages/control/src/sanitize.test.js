import { assertSafeArgs } from './sanitize.js';

describe('assertSafeArgs (Mongo-operator injection guard, TZ §14.6)', () => {
  test('passes plain args', () => {
    expect(() => assertSafeArgs({ platform: 'telegram', count: 5, nested: { ok: true } })).not.toThrow();
  });

  test('rejects a $-prefixed key at any depth', () => {
    try {
      assertSafeArgs({ filter: { $where: 'sleep(1000)' } });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('INVALID_ARGS');
    }
  });

  test('rejects a key containing a dot (dotted-path injection)', () => {
    try {
      assertSafeArgs({ 'a.b': 1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('INVALID_ARGS');
    }
  });

  test('rejects $-keys inside arrays', () => {
    expect(() => assertSafeArgs({ list: [{ $gt: 1 }] })).toThrow('INVALID_ARGS');
  });
});
