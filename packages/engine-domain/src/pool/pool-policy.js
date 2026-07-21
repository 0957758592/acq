// Generic pool-replenish policy (TZ §3.4). Shared by the account pool and the
// proxy pool (§5.9) — DRY: one implementation, parameterized per (platform,
// source) or per (proxy type, geo) by the caller.
export function needsReplenish({ available, threshold }) {
  return available < threshold;
}

export function buyQuantity({ available, threshold, batchSize }) {
  if (available >= threshold) return 0;
  const gap = threshold - available;
  const batches = Math.ceil(gap / batchSize);
  return batches * batchSize;
}
