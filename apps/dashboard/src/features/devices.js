// Devices feature view-model (TZ §11.9). Pure transform of device.status rows
// into view-state: per-status counts + aggregate capacity. No I/O, no state.
export function devicesViewModel(devices = []) {
  const rows = devices.map((d) => ({
    id: String(d._id ?? d.id ?? ''),
    provider: d.provider ?? '',
    providerDeviceId: d.providerDeviceId ?? '',
    status: d.status ?? 'unknown',
    maxAccounts: d.capacity?.maxAccounts ?? 0,
    activeAccounts: d.capacity?.activeAccountCount ?? (d.capacity?.occupiedAccountIds?.length ?? 0),
    subscriptionVerified: Boolean(d.providerMeta?.subscriptionVerified)
  }));
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const capacity = rows.reduce((a, r) => ({ max: a.max + r.maxAccounts, active: a.active + r.activeAccounts }), { max: 0, active: 0 });
  return { total: rows.length, byStatus, capacity, rows };
}
