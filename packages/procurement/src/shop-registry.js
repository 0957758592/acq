import { validateShopSpec } from './spec-schema.js';

// ShopRegistry (TZ §6.5): persists validated ShopAdapterSpecs with their
// verify-by-fact `verified` gate, priority and pricing, and drives the
// approval workflow (§6.3). The mongoose model is injected. A spec is stored
// UNVERIFIED on register; execution is blocked until approve() flips it.
export function createShopRegistry({ model } = {}) {
  if (!model) throw new Error('createShopRegistry requires a mongoose model');

  return {
    async register(rawSpec) {
      const spec = validateShopSpec(rawSpec);
      return model.findOneAndUpdate(
        { shopId: spec.shopId },
        {
          $set: {
            baseUrl: spec.baseUrl,
            title: spec.title ?? '',
            platform: spec.platform ?? '',
            authKind: spec.auth.kind,
            spec,
            // Pool-selection fields (§6.5): drive selectForPlatform's priority
            // ordering and per-unit budget filter. Defaulted when the spec omits
            // them so an operator can set/update them via (re)register.
            priority: spec.priority ?? 100,
            unitPriceUsdCents: spec.unitPriceUsdCents ?? null,
            // A freshly (re)registered spec is unverified until re-approved.
            verified: Boolean(spec.verified)
          },
          $setOnInsert: { shopId: spec.shopId, available: true }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    },

    async get(shopId) {
      return model.findOne({ shopId }).lean();
    },

    async approve(shopId, { approvedBy } = {}) {
      return model.findOneAndUpdate(
        { shopId },
        { $set: { verified: true, approvedBy: approvedBy ?? null, approvedAt: new Date() } },
        { new: true }
      );
    },

    async listVerified(platform) {
      return model.find({ verified: true, ...(platform ? { platform } : {}) }).sort({ priority: 1 }).lean();
    },

    // Cheapest/highest-priority verified shop for a platform within an optional
    // per-unit budget (null = no budget cap).
    async selectForPlatform(platform, { maxUnitPriceUsdCents = null } = {}) {
      const shops = await this.listVerified(platform);
      const affordable = shops.filter(
        (s) => maxUnitPriceUsdCents == null || s.unitPriceUsdCents == null || s.unitPriceUsdCents <= maxUnitPriceUsdCents
      );
      return affordable[0] ?? null;
    }
  };
}
