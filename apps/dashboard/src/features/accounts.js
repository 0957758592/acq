// Accounts inventory feature view-model (TZ §11.9). Pure transforms of
// server-state (accounts from account.status) into view-state — filtering by
// platform/status/device/tag/score and summarizing. No I/O, no client state.
export function filterAccounts(accounts = [], { platform, status, device, tag, minScore } = {}) {
  return accounts.filter((a) => {
    if (platform && a.platform !== platform) return false;
    if (status && a.status !== status) return false;
    if (device && a.assignedDeviceId !== device) return false;
    if (tag && !(a.tags || []).includes(tag)) return false;
    if (minScore != null && (a.score ?? 0) < minScore) return false;
    return true;
  });
}

export function accountsViewModel(accounts = [], filters = {}) {
  const rows = filterAccounts(accounts, filters).map((a) => ({
    id: a.id,
    platform: a.platform,
    identifier: a.identifier,
    status: a.status,
    device: a.assignedDeviceId ?? null,
    tags: a.tags ?? [],
    score: a.score ?? null
  }));
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { total: rows.length, byStatus, rows };
}
