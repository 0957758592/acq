import { proxyError } from '@acq/proxy';
import { verifyProxy as defaultVerifyProxy } from '@acq/integrations';

// Generic HTTP ProxyProvider vendor adapter (TZ §5.9) — implements the
// ProxyProvider port over ANY declarative HTTP proxy vendor (922proxy / IPRoyal
// / BrightData / Smartproxy / …). The vendor's endpoints + response mapping are
// INJECTED (verify-by-fact — the exact API shape is supplied per vendor); the
// request/guard mechanism here is real. healthCheck is proven BY FACT (routes a
// request through the proxy via verifyProxy), never a self-reported flag.
// Absent a vendor config, the provider is simply not wired (an honest seam
// upstream) — it never fakes a purchase.
export function createHttpProxyProvider({
  httpClient,
  endpoints = {},
  map = {},
  verifyProxy = defaultVerifyProxy,
  resolveEndpoint = null
} = {}) {
  if (!httpClient?.request) throw new Error('createHttpProxyProvider requires an httpClient');

  const pick = (obj, path) => (path ? String(path).split('.').reduce((a, k) => (a == null ? a : a[k]), obj) : obj);

  async function call(name, body) {
    const ep = endpoints[name];
    if (!ep) throw proxyError('PROXY_VENDOR_UNCONFIGURED', `no ${name} endpoint configured`);
    return httpClient.request({ method: ep.method ?? 'GET', url: ep.url, auth: ep.auth, body });
  }

  return {
    async listProxies() {
      const res = await call('list');
      const items = pick(res, map.listItems) ?? [];
      return Array.isArray(items) ? items : [items];
    },

    async purchase({ type, geo, gb } = {}) {
      const res = await call('purchase', { type, geo, gb });
      const proxyId = pick(res, map.proxyId);
      if (!proxyId) throw proxyError('PROXY_PURCHASE_FAILED', 'vendor did not return a proxy id');
      return { proxyId, ...(map.endpoint ? { endpoint: pick(res, map.endpoint) } : {}) };
    },

    async rotate(proxyId) {
      const res = await call('rotate', { proxyId });
      return { proxyId: pick(res, map.proxyId) ?? proxyId };
    },

    // Local pool assignment is Mongo-backed (proxy-ops); the vendor is not asked
    // to bind a device unless it exposes an endpoint.
    async assign(proxyId, deviceId) {
      if (endpoints.assign) return call('assign', { proxyId, deviceId });
      return { ok: true, local: true };
    },
    async release(proxyId) {
      if (endpoints.release) return call('release', { proxyId });
      return { ok: true, local: true };
    },

    async healthCheck(proxyId) {
      const endpoint = resolveEndpoint ? await resolveEndpoint(proxyId) : null;
      if (!endpoint?.host || !endpoint?.port) {
        return { ok: false, error: 'PROXY_ENDPOINT_UNRESOLVED' };
      }
      try {
        const r = await verifyProxy(endpoint);
        return { ok: true, ip: r.effectiveIp };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
  };
}
