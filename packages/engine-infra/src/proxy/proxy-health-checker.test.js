import { createProxyHealthChecker } from './proxy-health-checker.js';

let t = 1_000;
const clock = { now: () => new Date((t += 50)) };

describe('createProxyHealthChecker (verify-by-fact proxy health)', () => {
  it('routes a request through the proxy and reports ok + effective IP + latency', async () => {
    const seen = {};
    const verifyProxy = async (endpoint) => { seen.endpoint = endpoint; return { effectiveIp: '5.6.7.8' }; };
    const checker = createProxyHealthChecker({ verifyProxy, clock, resolveEndpoint: async () => ({ host: 'h', port: 8080, username: 'u', password: 'p' }) });
    const h = await checker.check({ _id: 'p1', geo: 'us' });
    expect(h).toMatchObject({ ok: true, ip: '5.6.7.8', geo: 'us' });
    expect(typeof h.latencyMs).toBe('number');
    expect(seen.endpoint.host).toBe('h');
  });

  it('reports health.ok=false when the proxy check fails (fail-safe, never throws)', async () => {
    const verifyProxy = async () => { throw new Error('Proxy check timed out'); };
    const checker = createProxyHealthChecker({ verifyProxy, clock, resolveEndpoint: async () => ({ host: 'h', port: 8080 }) });
    const h = await checker.check({ _id: 'p1' });
    expect(h.ok).toBe(false);
    expect(h.error).toMatch(/timed out/);
  });

  it('reports unresolved endpoint without calling verifyProxy', async () => {
    let called = false;
    const verifyProxy = async () => { called = true; return {}; };
    const checker = createProxyHealthChecker({ verifyProxy, clock, secretResolver: { resolve: async () => null } });
    const h = await checker.check({ _id: 'p1', secretRef: 'env:missing' });
    expect(h).toMatchObject({ ok: false, error: 'PROXY_ENDPOINT_UNRESOLVED' });
    expect(called).toBe(false);
  });
});
