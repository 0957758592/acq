import { resolveResidentialProxy } from './resolve-residential-proxy.js';

const endpoint = { protocol: 'http', host: 'res.example', port: 8000, username: 'u', password: 'p' };

function ctx({ proxies = [], resolved = endpoint } = {}) {
  return {
    proxyRepo: { findAvailable: async (f = {}) => proxies.filter((p) => (f.geo ? p.geo === f.geo : true)) },
    secretResolver: { resolve: async () => resolved }
  };
}

describe('resolveResidentialProxy — auto-pick a residential proxy from the pool', () => {
  it('picks an available healthy residential proxy and builds its authenticated URL', async () => {
    const c = ctx({ proxies: [
      { _id: 'px-dc', type: 'datacenter', geo: 'US', status: 'available', health: { ok: true }, secretRef: 'vault:dc' },
      { _id: 'px-res', type: 'residential', geo: 'US', status: 'available', health: { ok: true }, secretRef: 'vault:res' }
    ] });
    const out = await resolveResidentialProxy(c, { geo: 'US' });
    expect(out.proxyId).toBe('px-res'); // residential, not the datacenter one
    expect(out.proxy).toBe('http://u:p@res.example:8000'); // authenticated URL
    expect(out.geo).toBe('US');
  });

  it('prefers a HEALTHY residential over an unchecked one', async () => {
    const c = ctx({ proxies: [
      { _id: 'a', type: 'residential', geo: 'US', status: 'available', health: { ok: false }, secretRef: 'r' },
      { _id: 'b', type: 'residential', geo: 'US', status: 'available', health: { ok: true }, secretRef: 'r' }
    ] });
    expect((await resolveResidentialProxy(c, { geo: 'US' })).proxyId).toBe('b');
  });

  it('coded seam when no residential proxy is available (never fabricates one)', async () => {
    const c = ctx({ proxies: [{ _id: 'dc', type: 'datacenter', geo: 'US', status: 'available', health: { ok: true }, secretRef: 'r' }] });
    await expect(resolveResidentialProxy(c, { geo: 'US' })).rejects.toMatchObject({ code: 'NO_RESIDENTIAL_PROXY_AVAILABLE' });
  });

  it('coded seam when the picked proxy has no usable endpoint', async () => {
    const c = ctx({ proxies: [{ _id: 'x', type: 'residential', geo: 'US', status: 'available', health: { ok: true }, secretRef: 'r' }], resolved: { host: '' } });
    await expect(resolveResidentialProxy(c, {})).rejects.toMatchObject({ code: 'PROXY_ENDPOINT_UNRESOLVED' });
  });
});
