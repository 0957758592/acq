// Proxy pool feature view-model (TZ §11.9). Pure transform of the proxy.status
// read-model into a table: 1:1 sticky proxies with geo, assignment and health.
export function proxiesViewModel(proxies = []) {
  const rows = proxies.map((p) => ({
    id: p._id ?? p.id,
    geo: p.geo ?? '—',
    status: p.status ?? '—',
    device: p.assignedDeviceId || '—',
    health: p.health?.ok ? `ok${p.health.latencyMs != null ? ` (${p.health.latencyMs}ms)` : ''}` : 'down'
  }));
  const byStatus = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  return { total: rows.length, byStatus, rows };
}
