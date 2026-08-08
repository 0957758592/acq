import mongoose from 'mongoose';

// Parser/action telemetry event (TZ §15/§10). One row per produced unit of work
// (a scrape pass, an executed action, a probe): what account/parser produced it,
// on which target/tier, the outcome, and a Mixed `metrics` bag (itemsOut, reach,
// impressions, likes, comments, follows, latencyMs, captchas, errors, cost…). The
// output-oriented rollups (summarizeTelemetry) live in observability/telemetry.
const TELEMETRY_OUTCOMES = ['ok', 'partial', 'failed'];

const engineTelemetrySchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    platform: { type: String, trim: true, required: true, index: true },
    // scrape | action | account | parser | … (defaults to the kind prefix at write)
    source: { type: String, trim: true, default: '' },
    // e.g. scrape.messages | scrape.followers | action.comment | account.probe
    kind: { type: String, trim: true, required: true },
    accountId: { type: String, trim: true, default: null },
    target: { type: String, trim: true, default: null },
    tier: { type: String, trim: true, default: null },
    outcome: { type: String, enum: TELEMETRY_OUTCOMES, default: 'ok' },
    metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    correlationId: { type: String, trim: true, default: null },
    ts: { type: Date, default: () => new Date(), index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
  },
  { collection: 'engine_telemetry', timestamps: true }
);

engineTelemetrySchema.index({ tenantId: 1, platform: 1, ts: -1 });
engineTelemetrySchema.index({ tenantId: 1, accountId: 1, ts: -1 });
engineTelemetrySchema.index({ tenantId: 1, kind: 1, ts: -1 });

export const EngineTelemetry =
  mongoose.models.EngineTelemetry || mongoose.model('EngineTelemetry', engineTelemetrySchema);

export { TELEMETRY_OUTCOMES };
