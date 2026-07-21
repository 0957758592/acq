// createExpenseRecorder — books a dark.shopping account purchase as an
// EngineExpense row. Mirrors the engine procurement precedent (persistImport):
// an expense is written only when the amount is positive (no zero-amount rows)
// and the write is idempotent via upsert on (provider, externalReference).
import { EngineExpense } from '@acq/core/models/engine-finance';

export function createExpenseRecorder({ model = EngineExpense } = {}) {
  return {
    async recordPurchaseExpense({ externalReference, amountUsdCents, quantity }) {
      if (!(amountUsdCents > 0)) return null;
      return model.findOneAndUpdate(
        { provider: 'dark_shopping', externalReference },
        {
          $set: {
            category: 'account',
            provider: 'dark_shopping',
            amountCents: amountUsdCents,
            currency: 'USD',
            description: `dark.shopping purchase x${quantity}`,
            externalReference,
            metadata: { quantity }
          }
        },
        { upsert: true, new: true }
      );
    }
  };
}
