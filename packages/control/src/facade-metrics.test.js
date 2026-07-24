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
