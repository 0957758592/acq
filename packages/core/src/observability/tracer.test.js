import { createTracer } from './tracer.js';

function build() {
  let t = 0;
  const emitted = [];
  const tracer = createTracer({ sink: (s) => emitted.push(s), clock: { now: () => (t += 10) }, idGen: (() => { let i = 0; return () => `id${++i}`; })() });
  return { tracer, emitted };
}

describe('createTracer (TZ §15 span-level distributed tracing)', () => {
  it('links job → device-op → vendor-call into ONE trace via parent/child spans', async () => {
    const { tracer, emitted } = build();
    const job = tracer.startSpan('job.run-action', { traceId: 'corr-123', attributes: { platform: 'telegram' } });
    const device = job.child('device.runAction', { attributes: { deviceId: 'BzSfu' } });
    const vendor = device.child('vendor.call', { attributes: { host: 'api.duoplus' } });
    vendor.end({ status: 'ok' });
    device.end({ status: 'ok' });
    job.end({ status: 'ok' });

    expect(emitted.map((s) => s.name)).toEqual(['vendor.call', 'device.runAction', 'job.run-action']);
    // one trace, correct parent chain
    expect(new Set(emitted.map((s) => s.traceId))).toEqual(new Set(['corr-123']));
    const [v, d, j] = emitted;
    expect(v.parentId).toBe(d.spanId);
    expect(d.parentId).toBe(j.spanId);
    expect(j.parentId).toBeNull();
    expect(j.attributes).toMatchObject({ platform: 'telegram' });
    expect(typeof j.durationMs).toBe('number');
  });

  it('withSpan closes the span on success AND on a coded failure', async () => {
    const { tracer, emitted } = build();
    await tracer.withSpan('ok.op', { traceId: 't1' }, async () => 'v');
    await expect(tracer.withSpan('bad.op', { traceId: 't1' }, async () => {
      throw Object.assign(new Error('nope'), { code: 'ACTION_NOT_CONFIRMED' });
    })).rejects.toThrow('nope');
    expect(emitted.map((s) => [s.name, s.status, s.error])).toEqual([
      ['ok.op', 'ok', null],
      ['bad.op', 'error', 'ACTION_NOT_CONFIRMED']
    ]);
  });

  it('keeps a bounded buffer of recent spans, filterable by traceId', async () => {
    const { tracer } = build();
    tracer.startSpan('a', { traceId: 'T1' }).end();
    tracer.startSpan('b', { traceId: 'T2' }).end();
    tracer.startSpan('c', { traceId: 'T1' }).end();
    expect(tracer.recentSpans({ traceId: 'T1' }).map((s) => s.name)).toEqual(['a', 'c']);
    expect(tracer.recentSpans().length).toBe(3);
  });

  it('does not grow without bound (ring buffer)', () => {
    const tracer = createTracer({ bufferSize: 2 });
    for (const n of ['s1', 's2', 's3']) tracer.startSpan(n, { traceId: 'T' }).end();
    expect(tracer.recentSpans().map((s) => s.name)).toEqual(['s2', 's3']);
  });
});
