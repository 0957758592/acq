// Minimal distributed tracer (TZ §15 "distributed tracing, span-level":
// job → device-op → vendor-call). Zero deps, same spirit as the in-process
// metrics registry: spans carry a traceId that propagates from the existing
// correlationId, so a request/job can be followed across surfaces and workers.
//
// Spans are emitted to an injected sink (structured logger in production) AND
// kept in a bounded ring buffer so operators/the brain can read recent traces
// through the facade — no external collector required to be useful.
function randomId() {
  return Math.random().toString(16).slice(2, 10);
}

export function createTracer({ sink = null, clock = { now: () => Date.now() }, bufferSize = 200, idGen = randomId } = {}) {
  const recent = [];

  function record(span) {
    recent.push(span);
    if (recent.length > bufferSize) recent.shift();
    sink?.(span);
  }

  function startSpan(name, { traceId, parentId = null, attributes = {} } = {}) {
    const span = {
      name,
      traceId: traceId || idGen(),
      spanId: idGen(),
      parentId,
      attributes,
      startedAt: clock.now(),
      endedAt: null,
      durationMs: null,
      status: 'unset',
      error: null
    };
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      // Child spans inherit the trace and point back at this span — that's what
      // makes job → device-op → vendor-call a single connected trace.
      child(childName, opts = {}) {
        return startSpan(childName, { ...opts, traceId: span.traceId, parentId: span.spanId });
      },
      setAttributes(attrs = {}) {
        Object.assign(span.attributes, attrs);
      },
      end({ status = 'ok', error = null } = {}) {
        span.endedAt = clock.now();
        span.durationMs = span.endedAt - span.startedAt;
        span.status = status;
        span.error = error;
        record(span);
        return span;
      }
    };
  }

  // Wraps an async fn in a span: ok on resolve, error (with the coded reason)
  // on reject — the span is ALWAYS closed.
  async function withSpan(name, opts, fn) {
    const span = startSpan(name, opts);
    try {
      const result = await fn(span);
      span.end({ status: 'ok' });
      return result;
    } catch (err) {
      span.end({ status: 'error', error: err?.code ?? err?.message ?? 'error' });
      throw err;
    }
  }

  return {
    startSpan,
    withSpan,
    recentSpans: ({ traceId = null, limit = 50 } = {}) =>
      recent.filter((s) => !traceId || s.traceId === traceId).slice(-limit)
  };
}
