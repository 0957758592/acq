// buyAccounts — application use-case. Pure orchestration over injected ports.
// Idempotent by orderId: if the order's accounts are already persisted, it does
// not re-insert or re-charge. (Job-level dedup via dispatchEngineJob idempotencyKey
// is the primary guard; this is the secondary in-handler guard, per Plan 3.)
export async function buyAccounts({ quantity }, { procurement, accountRepo, expenseRecorder }) {
  const order = await procurement.purchase(quantity);            // { orderId, amountUsdCents? }
  const existing = await accountRepo.find({ 'metadata.orderId': order.orderId });
  if (Array.isArray(existing) && existing.length > 0) {
    return { orderId: order.orderId, inserted: 0, idempotent: true };
  }
  const delivered = await procurement.fetchDelivered(order);     // PurchasedAccount[]
  await accountRepo.insertPurchased(delivered, { orderId: order.orderId });
  await expenseRecorder.recordPurchaseExpense({
    externalReference: order.orderId,
    amountUsdCents: order.amountUsdCents ?? 0,
    quantity
  });
  return { orderId: order.orderId, inserted: delivered.length, idempotent: false };
}
