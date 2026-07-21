import { createBrowserPool, canAcquire, acquireSession, releaseSession, activeCount } from './session-pool.js';

describe('createBrowserPool', () => {
  test('starts empty with the configured concurrency', () => {
    const pool = createBrowserPool({ maxConcurrent: 3 });
    expect(activeCount(pool)).toBe(0);
    expect(canAcquire(pool)).toBe(true);
    expect(pool.version).toBe(0);
  });
});

describe('acquireSession', () => {
  test('adds a session and bumps version', () => {
    const pool = acquireSession(createBrowserPool({ maxConcurrent: 2 }), 's1');
    expect(activeCount(pool)).toBe(1);
    expect(pool.version).toBe(1);
  });

  test('is idempotent for the same session id', () => {
    let pool = acquireSession(createBrowserPool({ maxConcurrent: 2 }), 's1');
    pool = acquireSession(pool, 's1');
    expect(activeCount(pool)).toBe(1);
  });

  test('throws BROWSER_POOL_EXHAUSTED at capacity', () => {
    let pool = createBrowserPool({ maxConcurrent: 1 });
    pool = acquireSession(pool, 's1');
    try {
      acquireSession(pool, 's2');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('BROWSER_POOL_EXHAUSTED');
    }
  });
});

describe('releaseSession', () => {
  test('frees a slot so a new session can be acquired', () => {
    let pool = acquireSession(createBrowserPool({ maxConcurrent: 1 }), 's1');
    expect(canAcquire(pool)).toBe(false);
    pool = releaseSession(pool, 's1');
    expect(canAcquire(pool)).toBe(true);
  });
});
