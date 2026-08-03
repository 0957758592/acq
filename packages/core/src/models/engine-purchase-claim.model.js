import mongoose from 'mongoose';

// Purchase idempotency claim (REQUIREM §2.1/§3.4). One row per acquire job's
// idempotency key: claimed BEFORE the shop is charged, then stamped with the
// order the instant it is placed. A redelivered acquire finds the claim and
// resumes off `orderId` instead of buying again — exactly-once on the money path.
const enginePurchaseClaimSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    idempotencyKey: { type: String, trim: true, required: true },
    status: { type: String, enum: ['purchasing', 'purchased'], default: 'purchasing', index: true },
    orderId: { type: String, trim: true, default: null },
    amountUsdCents: { type: Number, default: null },
    platform: { type: String, trim: true, default: '' }
  },
  { timestamps: true, collection: 'engine_purchase_claims' }
);

// The unique key is what makes the claim atomic (one winner per acquire job).
enginePurchaseClaimSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });

export const EnginePurchaseClaim =
  mongoose.models.EnginePurchaseClaim || mongoose.model('EnginePurchaseClaim', enginePurchaseClaimSchema);
