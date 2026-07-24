// Selectors feature view-model (TZ §11.9). Pure transform of the acq://selectors
// override list (or device.selectors reads) into view-state: per-platform rows
// showing which selector groups are tuned for the live app build.
export function selectorsViewModel(overrides = []) {
  const rows = overrides.map((o) => ({
    platform: o.platform,
    groups: Object.keys(o.selectors ?? {}),
    json: JSON.stringify(o.selectors ?? {})
  }));
  return { total: rows.length, rows };
}
