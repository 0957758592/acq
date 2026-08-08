// Generic TargetRepo — the callable targets database (TZ §3.5/§10.5). Idempotent
// upsert by the natural (tenant, platform, targetType, identifier) key so a target
// discovered by a scraper, added manually, or imported from a list converges to
// one row; cursor pagination on reads (REQUIREM §2.5); a flexible patch drives the
// status/score/tag/metadata transitions the surface ops expose. Model injected;
// every query is tenant-scoped (§14.2 — no cross-tenant leak).
export function createMongoTargetRepo({ model, tenantId = 'default', clock = { now: () => new Date() } } = {}) {
  if (!model) throw new Error('createMongoTargetRepo requires a mongoose model');

  const selectorQuery = (sel = {}) =>
    sel.id != null
      ? { tenantId, _id: sel.id }
      : { tenantId, platform: sel.platform, targetType: sel.targetType, identifier: sel.identifier };

  return {
    async upsertMany(targets = []) {
      if (!targets.length) return { upserted: 0 };
      const now = clock.now();
      const ops = targets.map((t) => ({
        updateOne: {
          filter: { tenantId, platform: t.platform, targetType: t.targetType, identifier: t.identifier },
          update: {
            $set: {
              source: t.source ?? 'manual',
              ...(t.metadata ? { metadata: t.metadata } : {}),
              ...(t.score != null ? { score: t.score } : {}),
              lastSeenAt: now
            },
            $setOnInsert: { tenantId, status: t.status ?? 'new', version: 0 }
          },
          upsert: true
        }
      }));
      const res = await model.bulkWrite(ops);
      return { upserted: res.upsertedCount ?? ops.length, matched: res.matchedCount ?? 0 };
    },

    async page(filter = {}, { cursor = null, limit = 100 } = {}) {
      const query = { tenantId };
      if (filter.platform) query.platform = filter.platform;
      if (filter.targetType) query.targetType = filter.targetType;
      if (filter.status) query.status = filter.status;
      if (filter.source) query.source = filter.source;
      if (filter.minScore != null) query.score = { $gte: filter.minScore };
      if (filter.tag) query.tags = filter.tag;
      if (cursor) query._id = { $gt: cursor };
      return model.find(query).sort({ _id: 1 }).limit(limit).lean();
    },

    async get(selector = {}) {
      return model.findOne(selectorQuery(selector)).lean();
    },

    async patch(selector = {}, { status, score, addTags = [], removeTags = [], metadataMerge } = {}) {
      const $set = {};
      if (status !== undefined) $set.status = status;
      if (score !== undefined) $set.score = score;
      if (metadataMerge && typeof metadataMerge === 'object') {
        for (const [k, v] of Object.entries(metadataMerge)) $set[`metadata.${k}`] = v;
      }
      const update = { $inc: { version: 1 } };
      if (Object.keys($set).length) update.$set = $set;
      if (addTags.length) update.$addToSet = { tags: { $each: addTags } };
      if (removeTags.length) update.$pull = { tags: { $in: removeTags } };
      return model.findOneAndUpdate(selectorQuery(selector), update, { new: true });
    }
  };
}
