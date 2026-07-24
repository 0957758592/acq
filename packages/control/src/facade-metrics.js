// Facade → Prometheus metrics adapter (TZ §15). Turns each execute() outcome
// into counters on the injected metrics registry: total ops (by operation/role/
// outcome), errors, and cumulative latency. Zero business logic.
export function createFacadeMetrics(registry) {
  const ops = registry.counter('acq_facade_ops_total', 'facade operations by outcome');
  const errs = registry.counter('acq_facade_errors_total', 'facade operation errors');
  const latency = registry.counter('acq_facade_op_ms_total', 'cumulative facade op latency (ms)');
  return {
    recordOp({ operation, role, outcome, ms }) {
      ops.inc({ operation, role, outcome });
      if (outcome !== 'ok') errs.inc({ operation, outcome });
      latency.inc({ operation }, ms || 0);
    }
  };
}
