export function needsReplenish({ available, threshold }) {
  return available < threshold;
}

export function buyQuantity({ available, threshold, batchSize }) {
  if (available >= threshold) return 0;
  const gap = threshold - available;
  const batches = Math.ceil(gap / batchSize);
  return batches * batchSize;
}
