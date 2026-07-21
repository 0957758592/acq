import { needsReplenish, buyQuantity } from './pool-policy.js';

describe('pool policy', () => {
  it('needs replenish when available below threshold', () => {
    expect(needsReplenish({ available: 3, threshold: 10 })).toBe(true);
    expect(needsReplenish({ available: 10, threshold: 10 })).toBe(false);
  });

  it('buys at least the batch size', () => {
    expect(buyQuantity({ available: 9, threshold: 10, batchSize: 5 })).toBe(5);
  });

  it('buys enough to cover a large gap, rounded up to batches', () => {
    expect(buyQuantity({ available: 0, threshold: 12, batchSize: 5 })).toBe(15);
  });

  it('buys nothing when at or above threshold', () => {
    expect(buyQuantity({ available: 10, threshold: 10, batchSize: 5 })).toBe(0);
  });
});
