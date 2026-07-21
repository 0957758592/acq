import { needsReplenish, buyQuantity } from './pool-policy.js';

describe('needsReplenish', () => {
  test('true when available is below threshold', () => {
    expect(needsReplenish({ available: 2, threshold: 5 })).toBe(true);
  });
  test('false when at or above threshold', () => {
    expect(needsReplenish({ available: 5, threshold: 5 })).toBe(false);
  });
});

describe('buyQuantity (batch-rounded gap)', () => {
  test('rounds the gap up to a whole number of batches', () => {
    expect(buyQuantity({ available: 2, threshold: 10, batchSize: 5 })).toBe(10);
  });
  test('is zero when no replenish is needed', () => {
    expect(buyQuantity({ available: 10, threshold: 10, batchSize: 5 })).toBe(0);
  });
  test('exact multiple stays exact', () => {
    expect(buyQuantity({ available: 0, threshold: 6, batchSize: 3 })).toBe(6);
  });
});
