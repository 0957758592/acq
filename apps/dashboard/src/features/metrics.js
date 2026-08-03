// Domain metrics feature view-model (TZ §15/§11.9). Pure transform of the
// metrics.domain read-model (per-platform pool/online/ban/campaign + per-device
// saturation) into a table, so live observability is visible on the dashboard.
const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

export function metricsViewModel(platforms = []) {
  const rows = platforms.map((p) => {
    const saturations = (p.devices ?? []).map((d) => d.saturation ?? 0);
    const maxSaturation = saturations.length ? pct(Math.max(...saturations)) : '—';
    return {
      platform: p.platform,
      poolAvailable: p.poolAvailable ?? 0,
      online: p.accountsOnline ?? 0,
      banned: p.accountsBanned ?? 0,
      banShare: pct(p.banShare ?? 0),
      campaigns: p.campaignsActive ?? 0,
      maxSaturation
    };
  });
  return { total: rows.length, rows };
}
