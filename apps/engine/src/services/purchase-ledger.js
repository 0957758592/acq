// Purchase idempotency ledger (REQUIREM §2.1/§3.4) — the atomic claim behind the
// acquire handler's exactly-once money path. `begin` upserts the claim on the
// unique {tenantId, idempotencyKey}: the winner gets `null` (no prior) and buys;
// a redelivery gets the prior doc and RESUMES off `orderId`. `recordOrder` stamps
// the order the instant it is placed, so a retry never charges the shop twice.
export function createPurchaseLedger({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createPurchaseLedger requires a model');
  return {
    async begin(idempotencyKey) {
      // findOneAndUpdate(upsert, new:false) returns the PRE-existing doc, or null
      // when it inserts — that null is how we know we won the claim.
      return model.findOneAndUpdate(
        { tenantId, idempotencyKey },
        { $setOnInsert: { tenantId, idempotencyKey, status: 'purchasing' } },
        { upsert: true, new: false }
      );
    },
    async recordOrder(idempotencyKey, { orderId, amountUsdCents } = {}) {
      await model.updateOne(
        { tenantId, idempotencyKey },
        { $set: { orderId, amountUsdCents, status: 'purchased' } }
      );
    }
  };
}
