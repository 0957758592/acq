import mongoose from 'mongoose';

// Declarative ShopAdapterSpec persistence (TZ §6.5/§12.2). Holds the spec plus
// its verify-by-fact `verified` gate, priority and pricing for pool selection.
// The `spec` blob is the full ShopAdapterSpec validated by @acq/procurement.
const engineShopSpecSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    shopId: { type: String, trim: true, required: true },
    baseUrl: { type: String, trim: true, required: true },
    title: { type: String, trim: true, default: '' },
    platform: { type: String, trim: true, default: '' },
    authKind: { type: String, trim: true, default: '' },
    spec: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    verified: { type: Boolean, default: false, index: true },
    priority: { type: Number, default: 100 },
    unitPriceUsdCents: { type: Number, default: null },
    available: { type: Boolean, default: true },
    approvedBy: { type: String, trim: true, default: null },
    approvedAt: { type: Date, default: null }
  },
  { collection: 'engine_shop_specs', timestamps: true }
);

engineShopSpecSchema.index({ tenantId: 1, shopId: 1 }, { unique: true });
engineShopSpecSchema.index({ tenantId: 1, platform: 1, verified: 1, priority: 1 });

export const EngineShopSpec =
  mongoose.models.EngineShopSpec || mongoose.model('EngineShopSpec', engineShopSpecSchema);
