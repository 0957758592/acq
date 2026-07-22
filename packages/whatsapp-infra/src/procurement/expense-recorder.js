// dark.shopping purchase recorder — a thin, provider-fixed facade over the
// generic engine-infra expense recorder (single source of the EngineExpense
// upsert; no duplicated finance logic). Keeps the whatsapp-facing method name
// while delegating the idempotent write.
import { createExpenseRecorder as createGenericRecorder } from '@acq/engine-infra';
import { EngineExpense } from '@acq/core/models/engine-finance';

export function createExpenseRecorder({ model = EngineExpense } = {}) {
  const generic = createGenericRecorder({ model });
  return {
    async recordPurchaseExpense({ externalReference, amountUsdCents, quantity }) {
      return generic.record({
        provider: 'dark_shopping',
        category: 'account',
        externalReference,
        amountUsdCents,
        quantity,
        description: `dark.shopping purchase x${quantity}`
      });
    }
  };
}
