import { createMetricsRegistry } from './metrics.js';

describe('createMetricsRegistry', () => {
  test('counters increment and render in Prometheus format', () => {
    const m = createMetricsRegistry();
    const jobs = m.counter('acq_jobs_total', 'Jobs processed');
    jobs.inc({ queue: 'engine.action' });
    jobs.inc({ queue: 'engine.action' }, 2);
    jobs.inc({ queue: 'engine.scrape' });
    const text = m.render();
    expect(text).toContain('# TYPE acq_jobs_total counter');
    expect(text).toContain('acq_jobs_total{queue="engine.action"} 3');
    expect(text).toContain('acq_jobs_total{queue="engine.scrape"} 1');
  });

  test('gauges set an absolute value', () => {
    const m = createMetricsRegistry();
    const online = m.gauge('acq_accounts_online', 'Online accounts');
    online.set({ platform: 'telegram' }, 42);
    online.set({ platform: 'telegram' }, 40);
    expect(m.render()).toContain('acq_accounts_online{platform="telegram"} 40');
  });

  test('renders unlabeled metrics too', () => {
    const m = createMetricsRegistry();
    m.counter('acq_reconcile_ticks_total').inc();
    expect(m.render()).toContain('acq_reconcile_ticks_total 1');
  });

  test('escapes label values safely', () => {
    const m = createMetricsRegistry();
    m.counter('acq_errors_total').inc({ msg: 'a"b' });
    expect(m.render()).toContain('acq_errors_total{msg="a\\"b"} 1');
  });
});
