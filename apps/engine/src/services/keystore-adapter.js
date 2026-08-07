import { shopBuy } from './shop-buy.js';
import { buildDeliveredAccounts } from './shop-deliver.js';

// Procurement adapter for keystore-api shops (dark.shopping), matching the interface
// acquireHandler expects — { purchase(quantity), fetchDelivered({orderId}) } — so the
// AUTONOMOUS acquire job reuses the exactly-once ledger, insertAcquired, expense and
// events unchanged. This is what makes the reconciler buy+import on its own.
//
// - purchase(): the search-driven buy (confirm:true) with the job's idempotency key
//   as the vendor idempotence_id (exactly-once at BOTH our ledger and the vendor).
//   Selection defaults come from ctx.config.buyDefaults (e.g. strategy 'reliable',
//   minRating) so autonomous buys prefer high-rated suppliers.
// - fetchDelivered(): vaults + returns accounts; a NOT-ready order is a retryable
//   seam (DELIVERY_NOT_READY) — the DLQ retry re-calls order/download ("opens the
//   order details") on each pass until the vendor finishes fulfilling.
export function createKeystoreAdapter(ctx, { platform, shopId, idempotencyKey } = {}) {
  const d = ctx.config?.buyDefaults ?? {};
  return {
    async purchase(quantity) {
      const res = await shopBuy(ctx, {
        shopId,
        platform,
        quantity,
        strategy: d.strategy ?? 'reliable',
        minRating: d.minRating ?? null,
        maxInvalidPercent: d.maxInvalidPercent ?? null,
        maxUnitPriceRub: d.maxUnitPriceRub ?? null,
        country: d.country ?? null,
        confirm: true,
        idempotenceId: idempotencyKey ?? null
      });
      return { orderId: res.order.orderId, amountUsdCents: res.plan.totalUsdCents ?? 0 };
    },
    async fetchDelivered({ orderId }) {
      const { accounts } = await buildDeliveredAccounts(ctx, { shopId, orderId, platform });
      return accounts;
    }
  };
}
