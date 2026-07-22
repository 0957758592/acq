import { createRateLimiter } from './rate-limit.js';

function ctx() {
  let statusCode = null;
  let body = null;
  const headers = {};
  const res = {
    status(c) { statusCode = c; return this; },
    json(b) { body = b; return this; },
    setHeader: (k, v) => { headers[k] = v; }
  };
  return { res, get: () => ({ statusCode, body, headers }) };
}

describe('createRateLimiter', () => {
  test('allows up to max requests then 429s within the window', () => {
    let t = 1000;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t, keyFn: () => 'k' });
    const req = {};

    let nexts = 0;
    const c1 = ctx(); limiter(req, c1.res, () => nexts++);
    const c2 = ctx(); limiter(req, c2.res, () => nexts++);
    expect(nexts).toBe(2);

    const c3 = ctx(); limiter(req, c3.res, () => nexts++);
    expect(nexts).toBe(2); // blocked
    expect(c3.get().statusCode).toBe(429);
    expect(c3.get().body.error.code).toBe('RATE_LIMITED');
    expect(c3.get().headers['retry-after']).toBeDefined();
  });

  test('resets after the window elapses', () => {
    let t = 1000;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => t, keyFn: () => 'k' });
    let nexts = 0;
    limiter({}, ctx().res, () => nexts++);
    t = 2500; // past window
    limiter({}, ctx().res, () => nexts++);
    expect(nexts).toBe(2);
  });

  test('buckets are per-key', () => {
    const t = 1000;
    let count = 0;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => t, keyFn: (r) => r.k });
    limiter({ k: 'a' }, ctx().res, () => count++);
    limiter({ k: 'b' }, ctx().res, () => count++);
    expect(count).toBe(2);
  });
});
