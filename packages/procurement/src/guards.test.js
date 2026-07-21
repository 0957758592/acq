import { assertQuantity, assertPriceDrift, assertMaxTotal, assertBalance } from './guards.js';
import { DomainError } from '@acq/engine-domain';

function code(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    return err.code;
  }
}

describe('assertQuantity', () => {
  test('passes a positive integer', () => {
    expect(() => assertQuantity(5)).not.toThrow();
  });
  test('rejects zero / negative / non-integer', () => {
    expect(code(() => assertQuantity(0))).toBe('PROCUREMENT_QUANTITY_INVALID');
    expect(code(() => assertQuantity(-1))).toBe('PROCUREMENT_QUANTITY_INVALID');
    expect(code(() => assertQuantity(1.5))).toBe('PROCUREMENT_QUANTITY_INVALID');
  });
});

describe('assertPriceDrift', () => {
  test('passes within tolerance', () => {
    expect(() => assertPriceDrift({ liveUnit: 105, expectedUnit: 100, tolerance: 0.1 })).not.toThrow();
  });
  test('fails when drift exceeds tolerance', () => {
    expect(code(() => assertPriceDrift({ liveUnit: 130, expectedUnit: 100, tolerance: 0.1 }))).toBe(
      'PROCUREMENT_PRICE_DRIFT'
    );
  });
  test('fail-safe: non-positive expected unit throws', () => {
    expect(code(() => assertPriceDrift({ liveUnit: 100, expectedUnit: 0, tolerance: 0.1 }))).toBe(
      'PROCUREMENT_PRICE_DRIFT'
    );
  });
});

describe('assertMaxTotal', () => {
  test('passes at or below max', () => {
    expect(() => assertMaxTotal({ liveTotal: 500, maxTotal: 500 })).not.toThrow();
  });
  test('fails above max', () => {
    expect(code(() => assertMaxTotal({ liveTotal: 501, maxTotal: 500 }))).toBe('PROCUREMENT_MAX_TOTAL_EXCEEDED');
  });
  test('no max configured => no limit', () => {
    expect(() => assertMaxTotal({ liveTotal: 10_000, maxTotal: 0 })).not.toThrow();
  });
});

describe('assertBalance', () => {
  test('passes when balance covers the total', () => {
    expect(() => assertBalance({ balance: 500, liveTotal: 500 })).not.toThrow();
  });
  test('fails when balance is short', () => {
    expect(code(() => assertBalance({ balance: 499, liveTotal: 500 }))).toBe('PROCUREMENT_INSUFFICIENT_BALANCE');
  });
});
