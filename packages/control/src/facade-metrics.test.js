import { createFacade } from './facade.js';
import { createFacadeMetrics } from './facade-metrics.js';
import { createMetricsRegistry } from '@acq/core/observability/metrics';

describe('facade observability', () => {
  it('records each operation outcome into the injected metrics sink', async () => {
    const seen = [];
    const facade = createFacade({ useCases: { 'pool.status': async () => ({ ok: 1 }) }, metrics: { recordOp: (m) => seen.push(m) } });
    await facade.execute('pool.status', { role: 'readonly', args: {} });
    await facade.execute('pool.acquire', { role: 'readonly' }); // FORBIDDEN
    await facade.execute('nope.op', {});                        // UNKNOWN_OPERATION
    expect(seen.map((m) => [m.operation, m.outcome])).toEqual([
      ['pool.status', 'ok'], ['pool.acquire', 'FORBIDDEN'], ['nope.op', 'UNKNOWN_OPERATION']
    ]);
    expect(typeof seen[0].ms).toBe('number');
  });

  it('createFacadeMetrics renders Prometheus counters for ops + errors', async () => {
    const registry = createMetricsRegistry();
    const facade = createFacade({ useCases: { 'pool.status': async () => ({ ok: 1 }) }, metrics: createFacadeMetrics(registry) });
    await facade.execute('pool.status', { role: 'readonly', args: {} });
    await facade.execute('pool.acquire', { role: 'readonly' }); // FORBIDDEN
    const text = registry.render();
    expect(text).toContain('acq_facade_ops_total');
    expect(text).toMatch(/acq_facade_ops_total\{[^}]*operation="pool.status"[^}]*outcome="ok"[^}]*\} 1/);
    expect(text).toMatch(/acq_facade_errors_total\{[^}]*outcome="FORBIDDEN"[^}]*\} 1/);
  });
});

describe('facade tracing (TZ §15 span-level)', () => {
  it('opens a root span per operation using the correlationId as the traceId', async () => {
    const spans = [];
    const tracer = {
      withSpan: async (name, opts, fn) => { spans.push({ name, ...opts }); return fn({ child: () => ({ end() {} }) }); }
    };
    const facade = createFacade({ useCases: { 'pool.status': async () => ({ ok: 1 }) }, tracer });
    const res = await facade.execute('pool.status', { role: 'readonly', args: {}, correlationId: 'corr-9' });
    expect(res.data).toEqual({ ok: 1 });
    expect(spans[0]).toMatchObject({ name: 'op.pool.status', traceId: 'corr-9' });
    expect(spans[0].attributes).toMatchObject({ operation: 'pool.status', role: 'readonly' });
  });

  it('works with no tracer wired (observability is optional, never breaks the hot path)', async () => {
    const facade = createFacade({ useCases: { 'pool.status': async () => ({ ok: 1 }) } });
    expect((await facade.execute('pool.status', { role: 'readonly', args: {} })).data).toEqual({ ok: 1 });
  });
});
