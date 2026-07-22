// Circuit breaker for external/vendor calls (TZ §9.1/§14.8). Wraps a call:
// closed -> (failures >= threshold) open -> (after cooldown) half-open trial ->
// success closes, failure re-opens. Fast-fails with a coded CIRCUIT_OPEN while
// open so a downed vendor doesn't cascade. `now` injectable for tests.
export function createCircuitBreaker({ failureThreshold = 5, cooldownMs = 30_000, now = () => Date.now() } = {}) {
  let state = 'closed';
  let failures = 0;
  let openedAt = 0;

  function open() {
    state = 'open';
    openedAt = now();
  }

  return {
    state: () => state,
    async execute(fn) {
      if (state === 'open') {
        if (now() - openedAt < cooldownMs) {
          const err = new Error('circuit open');
          err.code = 'CIRCUIT_OPEN';
          throw err;
        }
        state = 'half-open';
      }
      try {
        const result = await fn();
        // Success: reset to closed.
        state = 'closed';
        failures = 0;
        return result;
      } catch (err) {
        if (state === 'half-open') {
          open();
        } else {
          failures += 1;
          if (failures >= failureThreshold) open();
        }
        throw err;
      }
    }
  };
}
