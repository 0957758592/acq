import { proxyError } from '../errors.js';

const DEFAULT_MAX_LATENCY_MS = 2000;

// A proxy is healthy only when the last check succeeded AND its latency is
// within budget. Missing health reads as unhealthy (fail-safe) — we never
// route work through a proxy we cannot prove is alive (TZ §5.10).
export function isHealthy(health, { maxLatencyMs = DEFAULT_MAX_LATENCY_MS } = {}) {
  if (!health || health.ok !== true) return false;
  if (typeof health.latencyMs === 'number' && health.latencyMs > maxLatencyMs) return false;
  return true;
}

export function needsRotation(health, opts) {
  return !isHealthy(health, opts);
}

// Selects the first healthy proxy from a pool; throws PROXY_POOL_EMPTY when
// none qualify (gate: no action without a healthy proxy).
export function selectHealthyProxy(pool = [], opts) {
  const chosen = pool.find((proxy) => isHealthy(proxy?.health, opts));
  if (!chosen) {
    throw proxyError('PROXY_POOL_EMPTY', 'no healthy proxy available in the pool');
  }
  return chosen;
}
