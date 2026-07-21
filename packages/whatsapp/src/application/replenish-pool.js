import { needsReplenish, buyQuantity } from '../domain/pool/pool-policy.js';

// replenishPool — application use-case. If the pool is below threshold, dispatch an
// idempotent buy job (hour-bucketed idempotencyKey → at most one buy per hour per tick).
export async function replenishPool({ accountRepo, jobDispatcher, config, clock }) {
  const available = await accountRepo.countAvailable();
  if (!needsReplenish({ available, threshold: config.poolThreshold })) {
    return { dispatched: false, available };
  }
  const quantity = buyQuantity({ available, threshold: config.poolThreshold, batchSize: config.buyBatchSize });
  const bucket = clock.now().toISOString().slice(0, 13); // yyyy-mm-ddThh
  await jobDispatcher.dispatch(
    'whatsapp.buy',
    { jobName: 'buy-accounts', payload: { quantity } },
    { idempotencyKey: `buy:${bucket}` }
  );
  return { dispatched: true, quantity, available };
}
