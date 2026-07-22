// Generic ScrapeResultRepo — idempotent upsert of normalized read-models by the
// natural `key` (TZ §4/§10.3). Bulk upsert for throughput; cursor pagination on
// listResults (REQUIREM §2.5). Model injected.
export function createMongoScrapeResultRepo({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createMongoScrapeResultRepo requires a mongoose model');

  return {
    async upsertResults(entities = []) {
      if (!entities.length) return { upserted: 0 };
      const ops = entities.map((e) => ({
        updateOne: {
          filter: { tenantId, key: e.key },
          update: {
            $set: {
              platform: e.platform,
              type: e.type,
              target: e.target ?? '',
              data: e.data ?? {},
              capturedAt: e.capturedAt ?? null
            },
            $setOnInsert: { tenantId, key: e.key }
          },
          upsert: true
        }
      }));
      const res = await model.bulkWrite(ops);
      return { upserted: res.upsertedCount ?? ops.length };
    },

    async listResults(filter = {}, { cursor = null, limit = 100 } = {}) {
      const query = { ...filter };
      if (cursor) query._id = { $gt: cursor };
      return model.find(query).sort({ _id: 1 }).limit(limit).lean();
    }
  };
}
