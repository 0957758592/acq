// Email identities feature view-model (TZ §6.4/§11.9). Pure transform of the
// email.identity.list read-model into a table by email TYPE. Secrets are already
// stripped upstream (only `hasPasswordRef`/`hasAccessTokenRef` booleans arrive);
// this never surfaces a credential.
export function emailIdentitiesViewModel(identities = []) {
  const rows = identities.map((i) => ({
    address: i.address,
    provider: i.provider ?? 'custom',
    category: i.category ?? 'standard',
    auth: i.hasAccessTokenRef ? 'token' : i.hasPasswordRef ? 'password' : '—',
    status: i.status ?? 'active'
  }));
  const byCategory = rows.reduce((acc, r) => ({ ...acc, [r.category]: (acc[r.category] ?? 0) + 1 }), {});
  return { total: rows.length, byCategory, rows };
}
