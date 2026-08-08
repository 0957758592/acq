// TelemetryRepo — append-only store of parser/action telemetry events (TZ §15).
// Write-heavy + windowed reads (dashboards/summaries fetch a recent slice), so
// records are bulk-inserted and queries sort most-recent-first over a `since`
// window. Tenant-scoped throughout (§14.2). Model injected. Event canonicalization
// (normalizeTelemetryEvent) happens at the emitter/op layer, above this repo.
export function createMongoTelemetryRepo({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createMongoTelemetryRepo requires a mongoose model');

  return {
    async recordMany(events = []) {
      if (!events.length) return { inserted: 0 };
      const docs = events.map((e) => ({ ...e, tenantId: e.tenantId ?? tenantId }));
      await model.insertMany(docs, { ordered: false });
      return { inserted: docs.length };
    },

    async query(filter = {}, { limit = 200 } = {}) {
      const query = { tenantId };
      if (filter.platform) query.platform = filter.platform;
      if (filter.kind) query.kind = filter.kind;
      if (filter.source) query.source = filter.source;
      if (filter.accountId) query.accountId = filter.accountId;
      if (filter.outcome) query.outcome = filter.outcome;
      if (filter.target) query.target = filter.target;
      if (filter.since) query.ts = { $gte: filter.since };
      return model.find(query).sort({ ts: -1, _id: -1 }).limit(limit).lean();
    }
  };
}
