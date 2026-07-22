import { createCircuitBreaker } from './circuit-breaker.js';

describe('createCircuitBreaker', () => {
  test('passes through while closed', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    await expect(cb.execute(async () => 'ok')).resolves.toBe('ok');
    expect(cb.state()).toBe('closed');
  });

  test('opens after the failure threshold and fast-fails with CIRCUIT_OPEN', async () => {
    let t = 0;
    const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: () => t });
    const boom = async () => { throw new Error('vendor down'); };
    await expect(cb.execute(boom)).rejects.toThrow('vendor down');
    await expect(cb.execute(boom)).rejects.toThrow('vendor down');
    expect(cb.state()).toBe('open');
    // Now fast-fails without calling fn.
    let called = false;
    await expect(cb.execute(async () => { called = true; })).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(called).toBe(false);
  });

  test('half-opens after cooldown, closes on success', async () => {
    let t = 0;
    const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 500, now: () => t });
    await expect(cb.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    expect(cb.state()).toBe('open');
    t = 600; // past cooldown -> half-open trial
    await expect(cb.execute(async () => 'recovered')).resolves.toBe('recovered');
    expect(cb.state()).toBe('closed');
  });

  test('half-open failure re-opens', async () => {
    let t = 0;
    const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 500, now: () => t });
    await expect(cb.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    t = 600;
    await expect(cb.execute(async () => { throw new Error('still down'); })).rejects.toThrow('still down');
    expect(cb.state()).toBe('open');
  });
});
