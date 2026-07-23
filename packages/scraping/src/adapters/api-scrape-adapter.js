import { domainError } from '@acq/engine-domain';

// API scrape tier adapter (TZ §10.1 T3) — a REAL client for official/unofficial
// platform JSON APIs. Resolves the per-platform endpoint + auth (injected,
// verify-by-fact), fetches JSON, and picks the raw items for the ScrapeProvider
// to normalize. A rate-limit is a hard coded stop (SCRAPE_RATE_LIMITED); an
// unavailable target is SCRAPE_TARGET_UNAVAILABLE. The fetch+pick mechanism is
// real and generic; the per-platform endpoint/JSON shape is supplied by the
// caller (endpointRegistry) so a single adapter serves every platform.
export function createApiScrapeAdapter({
  fetchImpl = globalThis.fetch,
  resolveEndpoint,
  pickItems,
  endpointRegistry = null,
  headers = { accept: 'application/json' }
} = {}) {
  if (!endpointRegistry && (typeof resolveEndpoint !== 'function' || typeof pickItems !== 'function')) {
    throw new Error('api scrape adapter requires resolveEndpoint+pickItems or an endpointRegistry');
  }

  function endpointFor(req) {
    if (endpointRegistry) {
      const e = endpointRegistry.forPlatform(req.platform);
      if (!e?.resolveEndpoint || !e?.pickItems) {
        throw domainError('SCRAPE_API_UNVERIFIED', `no verified API endpoint for ${req.platform}`);
      }
      return { resolveEndpoint: e.resolveEndpoint, pickItems: e.pickItems, headers: e.headers ?? headers };
    }
    return { resolveEndpoint, pickItems, headers };
  }

  return {
    async scrape(req) {
      const e = endpointFor(req);
      const { url, init } = normalizeTarget(e.resolveEndpoint(req), e.headers);
      const res = await fetchImpl(url, init);
      if (res.status === 429) throw domainError('SCRAPE_RATE_LIMITED', `API rate-limited (429) for ${url}`);
      if (!res.ok) throw domainError('SCRAPE_TARGET_UNAVAILABLE', `API ${res.status} for ${url}`);
      const json = await res.json();
      const rawItems = e.pickItems(json, req) ?? [];
      return { rawItems: Array.isArray(rawItems) ? rawItems : [rawItems] };
    }
  };
}

function normalizeTarget(target, headers) {
  if (typeof target === 'string') return { url: target, init: { headers } };
  return { url: target.url, init: { method: target.method ?? 'GET', headers: { ...headers, ...target.headers }, body: target.body } };
}
