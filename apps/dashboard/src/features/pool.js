// Pool feature view-model (TZ §11.9). Pure transform of per-platform pool.status
// results into a single availability table + total.
export function poolViewModel(statuses = []) {
  const rows = statuses.map((s) => ({ platform: s.platform, source: s.source ?? 'purchase', available: s.available ?? 0 }));
  const totalAvailable = rows.reduce((a, r) => a + r.available, 0);
  return { totalAvailable, rows };
}
