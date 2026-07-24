// On-device selector override store (TZ §9.4). Reads/writes per-platform
// selector overrides and exposes an async `forPlatform` the automation adapter
// passes into driver calls (opts.selectors). Model injected; tenant-scoped.
export function createSelectorStore({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createSelectorStore requires a model');
  return {
    async get(platform) {
      const doc = await model.findOne({ tenantId, platform }).lean();
      return { platform, selectors: doc?.selectors ?? {}, updatedBy: doc?.updatedBy ?? null };
    },
    async set(platform, selectors, { updatedBy = null } = {}) {
      const doc = await model.findOneAndUpdate(
        { tenantId, platform },
        { $set: { selectors: selectors ?? {}, updatedBy }, $setOnInsert: { tenantId, platform } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return { platform, selectors: doc.selectors ?? {}, updatedBy: doc.updatedBy ?? null };
    },
    async list() {
      return (await model.find({ tenantId }).lean()).map((d) => ({ platform: d.platform, selectors: d.selectors ?? {} }));
    },
    // The provider the automation adapter uses to resolve overrides at call time.
    async forPlatform(platform) {
      return (await this.get(platform)).selectors;
    }
  };
}
