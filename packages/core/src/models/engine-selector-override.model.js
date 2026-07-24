import mongoose from 'mongoose';

// Per-platform on-device selector overrides (TZ §9.4). Operators tune the login
// / action / report selector text sets to a live app build WITHOUT code changes;
// the drivers union these over their built-in seeds. Managed via the
// device.selectors.* facade ops (every surface) and read for grounding via
// acq://selectors. Multi-tenant; one doc per platform.
const engineSelectorOverrideSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    platform: { type: String, trim: true, required: true },
    selectors: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    updatedBy: { type: String, trim: true, default: null }
  },
  { collection: 'engine_selector_overrides', timestamps: true }
);

engineSelectorOverrideSchema.index({ tenantId: 1, platform: 1 }, { unique: true });

export const EngineSelectorOverride =
  mongoose.models.EngineSelectorOverride || mongoose.model('EngineSelectorOverride', engineSelectorOverrideSchema);
