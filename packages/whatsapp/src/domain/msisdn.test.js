import { createMsisdn, normalizeMsisdn } from './msisdn.js';

describe('normalizeMsisdn', () => {
  it('normalizes spacing and separators to E.164', () => {
    expect(normalizeMsisdn('+49 170 123-4567')).toBe('+491701234567');
  });

  it('converts a 00 international prefix to +', () => {
    expect(normalizeMsisdn('0049 170 1234567')).toBe('+491701234567');
  });

  it('rejects non-numeric input', () => {
    expect(() => normalizeMsisdn('not-a-number')).toThrow('MSISDN_INVALID');
  });

  it('rejects too-short numbers', () => {
    expect(() => normalizeMsisdn('+12')).toThrow('MSISDN_INVALID');
  });
});

describe('createMsisdn', () => {
  it('exposes the canonical value and compares by value', () => {
    const a = createMsisdn('+49 170 1234567');
    const b = createMsisdn('00491701234567');
    expect(a.value).toBe('+491701234567');
    expect(a.equals(b)).toBe(true);
  });

  it('is frozen', () => {
    const m = createMsisdn('+491701234567');
    expect(Object.isFrozen(m)).toBe(true);
  });
});
