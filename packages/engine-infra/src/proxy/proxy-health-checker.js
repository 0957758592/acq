import { verifyProxy as defaultVerifyProxy } from '@acq/integrations';

// Real ProxyProvider health check (TZ §5.10) — proves a proxy is alive BY FACT
// by routing a request through it (never a self-reported flag). Resolves the
// proxy's endpoint from its vaulted secretRef, times the check, and returns the
// effective egress IP. A failure is health.ok=false (fail-safe: we never route
// account work through a proxy we cannot prove). verifyProxy + secretResolver +
// clock are injected so the logic is testable without a live proxy.
export function createProxyHealthChecker({
  verifyProxy = defaultVerifyProxy,
  secretResolver,
  clock = { now: () => new Date() },
  checkUrl,
  resolveEndpoint
} = {}) {
  const resolve =
    resolveEndpoint ??
    (async (proxy) => {
      const resolved = proxy.secretRef ? await secretResolver.resolve(proxy.secretRef) : null;
      return resolved && typeof resolved === 'object' ? resolved : null;
    });

  return {
    async check(proxy) {
      const endpoint = await resolve(proxy);
      if (!endpoint?.host || !endpoint?.port) {
        return { ok: false, error: 'PROXY_ENDPOINT_UNRESOLVED', lastCheckAt: clock.now() };
      }
      const startedAt = clock.now().getTime();
      try {
        const result = await verifyProxy(endpoint, checkUrl ? { checkUrl } : {});
        return { ok: true, ip: result.effectiveIp, geo: proxy.geo || '', latencyMs: clock.now().getTime() - startedAt, lastCheckAt: clock.now() };
      } catch (err) {
        return { ok: false, error: err.message, latencyMs: clock.now().getTime() - startedAt, lastCheckAt: clock.now() };
      }
    }
  };
}
