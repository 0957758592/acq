import mongoose from 'mongoose';

// Callable targets registry (TZ §3.5/§10.5) — the first-class database of action/
// scrape TARGETS (channels, groups, profiles, users, videos, posts, hashtags,
// phones) that campaigns act on, scrapers enrich, scoring ranks, and the AI
// selects to comment on. Platform-parameterized, multi-tenant, opt-lock. A target
// is deduped per (tenant, platform, targetType, identifier). `metadata` is Mixed
// so per-platform enrichment (followers, engagement, views — the output-max
// signals for tiktok/ig) and scrape provenance ride along without schema churn.
const TARGET_STATUSES = ['new', 'enriched', 'queued', 'acted', 'excluded'];

const engineTargetSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    platform: { type: String, trim: true, required: true, index: true },
    // channel | group | profile | user | video | post | hashtag | phone | … (extensible)
    targetType: { type: String, trim: true, required: true },
    identifier: { type: String, trim: true, required: true },
    // scrape | manual | import | campaign — where the target came from
    source: { type: String, trim: true, default: 'manual' },
    status: { type: String, enum: TARGET_STATUSES, default: 'new', index: true },
    // ranking score (0..1), set by scoring.score / target.score; null = unscored
    score: { type: Number, default: null },
    tags: { type: [String], default: () => [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    lastSeenAt: { type: Date, default: null },
    version: { type: Number, default: 0 }
  },
  { collection: 'engine_targets', timestamps: true }
);

engineTargetSchema.index({ tenantId: 1, platform: 1, targetType: 1, identifier: 1 }, { unique: true });
engineTargetSchema.index({ tenantId: 1, platform: 1, status: 1 });
engineTargetSchema.index({ tenantId: 1, platform: 1, score: -1 });

export const EngineTarget =
  mongoose.models.EngineTarget || mongoose.model('EngineTarget', engineTargetSchema);

export { TARGET_STATUSES };
