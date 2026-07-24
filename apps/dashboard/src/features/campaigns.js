// Campaigns feature view-model (TZ §11.9). Pure transform of campaign.status
// rows into view-state: per-status counts + per-campaign rows.
export function campaignsViewModel(campaigns = []) {
  const rows = campaigns.map((c) => ({
    id: String(c._id ?? c.id ?? c.campaignId ?? ''),
    platform: c.platform,
    actionType: c.actionType,
    status: c.status ?? 'active',
    strategy: c.strategy ?? '',
    targets: c.targets ?? [],
    targetCount: (c.targets ?? []).length
  }));
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { total: rows.length, byStatus, rows };
}
