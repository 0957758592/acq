// Scrape feature view-model (TZ §11.9). Pure transform of scrape.results rows
// into view-state: per-type counts + a human summary per row (message content +
// author, or member/participant handle). Optional client-side type/platform filter.
export function scrapeViewModel(results = [], { type, platform } = {}) {
  const filtered = results.filter((r) => (!type || r.type === type) && (!platform || r.platform === platform));
  const byType = {};
  for (const r of filtered) byType[r.type] = (byType[r.type] ?? 0) + 1;
  const rows = filtered.map((r) => ({
    platform: r.platform,
    type: r.type,
    target: r.target ?? '',
    summary: r.data?.text != null
      ? `${r.data.author ?? '?'}: ${r.data.text}`
      : (r.data?.handle ?? r.data?.id ?? '')
  }));
  return { total: filtered.length, byType, rows };
}
