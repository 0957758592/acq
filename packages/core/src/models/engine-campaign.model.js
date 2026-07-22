import mongoose from 'mongoose';

// Action campaign (TZ §3.5/§12.2). Generalizes the whatsapp report campaign:
// any actionType, any strategy, per-platform targets. Multi-tenant, opt-lock.
const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed', 'stopped'];

const engineCampaignSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    platform: { type: String, trim: true, required: true, index: true },
    actionType: { type: String, trim: true, required: true },
    strategy: { type: String, trim: true, default: 'all-accounts-per-target' },
    targets: { type: [String], default: () => [] },
    params: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },
    counts: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    version: { type: Number, default: 0 }
  },
  { collection: 'engine_campaigns', timestamps: true }
);

engineCampaignSchema.index({ tenantId: 1, platform: 1, status: 1 });

export const EngineCampaign =
  mongoose.models.EngineCampaign || mongoose.model('EngineCampaign', engineCampaignSchema);

export { CAMPAIGN_STATUSES };
