// Fixed-window rate limiter (TZ §14.6 / REQUIREM §4.6). Per-key request cap per
// window; returns 429 when exceeded. `store` (get/set) and `now` are injectable —
// pass a Redis-backed store for true cross-instance limits (in-memory Map is
// per-process). keyFn derives the bucket key (token or IP).
export function createRateLimiter({
  max = 100,
  windowMs = 60_000,
  now = () => Date.now(),
  store = new Map(),
  keyFn = (req) => req.auth?.actor || req.ip || 'anon'
} = {}) {
  return (req, res, next) => {
    const key = keyFn(req);
    const t = now();
    const entry = store.get(key);
    if (!entry || entry.resetAt <= t) {
      store.set(key, { count: 1, resetAt: t + windowMs });
      return next();
    }
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - t) / 1000);
      res.setHeader('retry-after', String(retryAfter));
      return res
        .status(429)
        .json({ data: null, error: { code: 'RATE_LIMITED', message: 'too many requests' }, meta: {} });
    }
    entry.count += 1;
    return next();
  };
}
