import { normalizeMsisdn } from './msisdn.js';
import { normalizeHandle } from './handle.js';
import { normalizeEmail } from './email.js';
import { normalizeIdentifier } from './identifier.js';
import { DomainError } from '../errors.js';

describe('normalizeMsisdn (E.164)', () => {
  test('normalizes spacing and 00 prefix', () => {
    expect(normalizeMsisdn('00 44 7911 123456')).toBe('+447911123456');
  });
  test('rejects a non-E.164 value', () => {
    expect(() => normalizeMsisdn('abc')).toThrow(DomainError);
  });
});

describe('normalizeHandle (@name)', () => {
  test('lowercases and strips a leading @', () => {
    expect(normalizeHandle('@MyUser')).toBe('@myuser');
  });
  test('adds a leading @ when missing', () => {
    expect(normalizeHandle('user_1')).toBe('@user_1');
  });
  test('rejects illegal characters', () => {
    expect(() => normalizeHandle('bad name!')).toThrow('HANDLE_INVALID');
  });
});

describe('normalizeEmail', () => {
  test('lowercases and trims', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
  test('rejects a malformed address', () => {
    expect(() => normalizeEmail('not-an-email')).toThrow('EMAIL_INVALID');
  });
});

describe('normalizeIdentifier (dispatch by identifierVO)', () => {
  test('routes msisdn', () => {
    expect(normalizeIdentifier('msisdn', '+1 202 555 0100')).toBe('+12025550100');
  });
  test('routes handle', () => {
    expect(normalizeIdentifier('handle', 'Bob')).toBe('@bob');
  });
  test('routes email', () => {
    expect(normalizeIdentifier('email', 'A@B.com')).toBe('a@b.com');
  });
  test('throws on an unknown identifierVO', () => {
    try {
      normalizeIdentifier('iban', 'x');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('IDENTIFIER_VO_UNKNOWN');
    }
  });
});
