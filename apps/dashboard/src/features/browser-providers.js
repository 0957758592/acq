// Browser backends feature view-model (TZ §4/§11.9). Pure transform of the
// browser.providers read-model into a table of pluggable login/scrape backends
// (own pool / Browserbase cloud) with their configured state + capabilities.
export function browserProvidersViewModel({ providers = [], default: def = 'own' } = {}) {
  const rows = providers.map((p) => ({
    provider: p.provider,
    kind: p.kind ?? '—',
    configured: p.configured ? 'yes' : 'no',
    isDefault: p.provider === def,
    concurrency: p.capabilities?.concurrency ?? '—'
  }));
  return { total: rows.length, default: def, rows };
}
