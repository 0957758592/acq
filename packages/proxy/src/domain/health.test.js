import { isHealthy, needsRotation, selectHealthyProxy } from './health.js';
import { ProxyError } from '../errors.js';

describe('isHealthy', () => {
  test('true when ok and within the latency budget', () => {
    expect(isHealthy({ ok: true, latencyMs: 800 }, { maxLatencyMs: 2000 })).toBe(true);
  });

  test('false when not ok', () => {
    expect(isHealthy({ ok: false, latencyMs: 10 }, { maxLatencyMs: 2000 })).toBe(false);
  });

  test('false when latency exceeds the budget', () => {
    expect(isHealthy({ ok: true, latencyMs: 5000 }, { maxLatencyMs: 2000 })).toBe(false);
  });

  test('missing health reads as unhealthy (fail-safe)', () => {
    expect(isHealthy(undefined, { maxLatencyMs: 2000 })).toBe(false);
  });
});

describe('needsRotation', () => {
  test('true when unhealthy', () => {
    expect(needsRotation({ ok: false }, { maxLatencyMs: 2000 })).toBe(true);
  });

  test('false when healthy', () => {
    expect(needsRotation({ ok: true, latencyMs: 100 }, { maxLatencyMs: 2000 })).toBe(false);
  });
});

describe('selectHealthyProxy (no action without a healthy proxy)', () => {
  const opts = { maxLatencyMs: 2000 };

  test('returns the first healthy proxy in the pool', () => {
    const pool = [
      { proxyId: 'p1', health: { ok: false, latencyMs: 10 } },
      { proxyId: 'p2', health: { ok: true, latencyMs: 500 } }
    ];
    expect(selectHealthyProxy(pool, opts).proxyId).toBe('p2');
  });

  test('throws PROXY_POOL_EMPTY when no healthy proxy exists', () => {
    const pool = [{ proxyId: 'p1', health: { ok: false } }];
    try {
      selectHealthyProxy(pool, opts);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProxyError);
      expect(err.code).toBe('PROXY_POOL_EMPTY');
    }
  });

  test('throws PROXY_POOL_EMPTY on an empty pool', () => {
    try {
      selectHealthyProxy([], opts);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('PROXY_POOL_EMPTY');
    }
  });
});
