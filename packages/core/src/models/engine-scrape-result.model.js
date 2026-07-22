import mongoose from 'mongoose';

// Normalized scrape read-model persistence (TZ §10.3/§12.2). The natural `key`
// (platform:type:...:entityId from @acq/scraping) is unique per tenant so
// repeated scrapes upsert idempotently instead of duplicating.
const engineScrapeResultSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    platform: { type: String, trim: true, required: true, index: true },
    type: { type: String, trim: true, required: true },
    target: { type: String, trim: true, default: '' },
    key: { type: String, trim: true, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    capturedAt: { type: Date, default: null },
    version: { type: Number, default: 0 }
  },
  { collection: 'engine_scrape_results', timestamps: true }
);

engineScrapeResultSchema.index({ tenantId: 1, key: 1 }, { unique: true });
engineScrapeResultSchema.index({ tenantId: 1, platform: 1, type: 1, target: 1 });

export const EngineScrapeResult =
  mongoose.models.EngineScrapeResult ||
  mongoose.model('EngineScrapeResult', engineScrapeResultSchema);
