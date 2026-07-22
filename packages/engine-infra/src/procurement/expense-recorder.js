import { EngineExpense } from '@acq/core/models/engine-finance';

// Generic expense recorder (TZ §6/§9 finance). Books ANY procurement spend
// (account purchase, device, proxy, verification) as an EngineExpense row for
// ANY provider. Idempotent via upsert on (provider, externalReference); a
// non-positive amount is never written (no zero-rows). Shared by the generic
// engine acquire flow and the per-platform apps — single source, no dup.
export function createExpenseRecorder({ model = EngineExpense } = {}) {
  return {
    async record({ provider, externalReference, amountUsdCents, category = 'account', platform, quantity, accountId = null, deviceId = null, description = '' }) {
      if (!(amountUsdCents > 0)) return null;
      return model.findOneAndUpdate(
        { provider, externalReference },
        {
          $set: {
            category,
            provider,
            amountCents: amountUsdCents,
            currency: 'USD',
            description: description || `${category} purchase${quantity ? ` x${quantity}` : ''}`,
            externalReference,
            accountId,
            deviceId,
            metadata: { platform, quantity }
          }
        },
        { upsert: true, new: true }
      );
    }
  };
}
