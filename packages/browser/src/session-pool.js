import { domainError } from '@acq/engine-domain';

// Browser session-pool capacity gating (TZ §10.6): a headless-browser fleet
// runs at most `maxConcurrent` live CDP sessions; acquisition beyond that blocks
// with a coded error so the engine applies backpressure instead of overloading.
// Pure transitions with an opt-lock version (mirrors device-queue).
export function createBrowserPool({ maxConcurrent = 1 } = {}) {
  return Object.freeze({ maxConcurrent, activeSessionIds: [], version: 0 });
}

export function activeCount(pool) {
  return pool.activeSessionIds.length;
}

export function canAcquire(pool) {
  return activeCount(pool) < pool.maxConcurrent;
}

function bump(pool, patch) {
  return Object.freeze({ ...pool, ...patch, version: pool.version + 1 });
}

export function acquireSession(pool, sessionId) {
  if (pool.activeSessionIds.includes(sessionId)) return pool;
  if (!canAcquire(pool)) {
    throw domainError('BROWSER_POOL_EXHAUSTED', `browser pool at capacity (${pool.maxConcurrent})`);
  }
  return bump(pool, { activeSessionIds: [...pool.activeSessionIds, sessionId] });
}

export function releaseSession(pool, sessionId) {
  return bump(pool, { activeSessionIds: pool.activeSessionIds.filter((id) => id !== sessionId) });
}
