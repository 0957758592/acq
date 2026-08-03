import { domainError } from '@acq/engine-domain';
import { buildProxyUrl } from '@acq/integrations';

// Auto-pick a residential proxy from the pool for a scrape (TZ §6.6/§10). Picks
// an AVAILABLE residential proxy (optionally by geo), preferring a health-checked
// one, resolves its vaulted endpoint the same way the health-checker does, and
// builds the authenticated proxy URL. Fails safe with a coded seam — never
// fabricates a proxy or a hostname.
export async function resolveResidentialProxy(ctx, { geo = null } = {}) {
  if (!ctx?.proxyRepo?.findAvailable) throw domainError('PROXY_POOL_UNAVAILABLE', 'no proxy pool wired');
  const resolveEndpoint = async (proxy) => {
    const resolved = proxy.secretRef ? await ctx.secretResolver.resolve(proxy.secretRef) : null;
    return resolved && typeof resolved === 'object' ? resolved : null;
  };

  const candidates = (await ctx.proxyRepo.findAvailable({ geo })).filter((p) => p.type === 'residential');
  const pick = candidates.find((p) => p.health?.ok) || candidates[0];
  if (!pick) throw domainError('NO_RESIDENTIAL_PROXY_AVAILABLE', `no available residential proxy${geo ? ` for ${geo}` : ''}`);

  const endpoint = await resolveEndpoint(pick);
  if (!endpoint?.host || !endpoint?.port) {
    throw domainError('PROXY_ENDPOINT_UNRESOLVED', `residential proxy ${pick._id ?? pick.id} has no usable endpoint`);
  }
  return { proxy: buildProxyUrl(endpoint), proxyId: String(pick._id ?? pick.id), geo: pick.geo || geo || '' };
}
