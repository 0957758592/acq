// Parser/action telemetry (TZ §15, §10 — "log all telemetry from the parsing").
// A distinct stream from EngineTelemetryBaseline (behavioural persona timings)
// and from domain-metrics (live pool/device snapshot): this records WHAT each
// account and parser PRODUCED — items scraped, actions executed, reach/engagement
// generated, errors/captchas, latency, cost. For tiktok/instagram the summary is
// deliberately OUTPUT-oriented (maximize produced output), for the rest it is
// throughput/health-oriented. Pure + injectable-clock so it is fully testable.

const coded = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code });

// Platforms whose telemetry we optimize for OUTPUT produced (reach/engagement),
// not just input throughput.
export const OUTPUT_MAX_PLATFORMS = new Set(['tiktok', 'instagram']);
// The produced-output signals (per event `metrics`) that define "output".
export const OUTPUT_KEYS = ['impressions', 'reach', 'views', 'likes', 'comments', 'shares', 'saves', 'follows'];
// Input/throughput signals for the non-output-max platforms.
export const THROUGHPUT_KEYS = ['itemsIn', 'itemsOut', 'requests'];

// Canonicalize one raw telemetry input. `source` defaults to the kind prefix
// (`scrape.messages` -> `scrape`). Metrics are coerced to finite numbers; any
// non-numeric metric is dropped (a hot path must never persist junk).
export function normalizeTelemetryEvent(input = {}, { clock } = {}) {
  const platform = input.platform;
  const kind = input.kind;
  if (!platform) throw coded('TELEMETRY_PLATFORM_REQUIRED', 'platform is required');
  if (!kind) throw coded('TELEMETRY_KIND_REQUIRED', 'kind is required');
  const metrics = {};
  for (const [k, v] of Object.entries(input.metrics ?? {})) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) metrics[k] = n;
  }
  const outcome = ['ok', 'partial', 'failed'].includes(input.outcome) ? input.outcome : 'ok';
  return {
    tenantId: input.tenantId ?? 'default',
    platform,
    source: input.source ?? String(kind).split('.')[0],
    kind,
    accountId: input.accountId ?? null,
    target: input.target ?? null,
    tier: input.tier ?? null,
    outcome,
    metrics,
    ts: input.ts ?? clock?.now?.() ?? new Date(),
    correlationId: input.correlationId ?? null,
    metadata: input.metadata ?? {}
  };
}

// Roll a batch of events into a summary. For output-max platforms the `focus`
// bundle + `outputScore` are the produced-output signals (what to maximize);
// otherwise `focus` is throughput. `totals` always carries every summed metric.
export function summarizeTelemetry(events = [], { platform } = {}) {
  const outcomes = { ok: 0, partial: 0, failed: 0 };
  const totals = {};
  for (const e of events) {
    if (e.outcome && outcomes[e.outcome] != null) outcomes[e.outcome] += 1;
    for (const [k, v] of Object.entries(e.metrics ?? {})) {
      if (Number.isFinite(v)) totals[k] = (totals[k] ?? 0) + v;
    }
  }
  const outputMax = OUTPUT_MAX_PLATFORMS.has(platform);
  const focusKeys = outputMax ? OUTPUT_KEYS : THROUGHPUT_KEYS;
  const focus = {};
  for (const k of focusKeys) focus[k] = totals[k] ?? 0;
  const outputScore = Object.values(focus).reduce((a, b) => a + b, 0);
  const count = events.length;
  return {
    platform: platform ?? null,
    outputMax,
    events: count,
    outcomes,
    totals,
    focus,
    outputScore,
    errorRate: count ? outcomes.failed / count : 0
  };
}
