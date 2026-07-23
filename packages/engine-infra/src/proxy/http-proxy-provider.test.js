import { createHttpProxyProvider } from './http-proxy-provider.js';

function fakeHttp(byUrl) {
  const calls = [];
  return { calls, request: async ({ method, url, body }) => { calls.push({ method, url, body }); return byUrl[url]; } };
}

const endpoints = {
  list: { method: 'GET', url: 'https://vendor/proxies' },
  purchase: { method: 'POST', url: 'https://vendor/buy' },
  rotate: { method: 'POST', url: 'https://vendor/rotate' }
};
const map = { listItems: 'data.items', proxyId: 'data.id', endpoint: 'data.endpoint' };

describe('createHttpProxyProvider (vendor adapter over ProxyProvider port)', () => {
  it('lists proxies from the vendor', async () => {
    const http = fakeHttp({ 'https://vendor/proxies': { data: { items: [{ id: 'p1' }, { id: 'p2' }] } } });
    const provider = createHttpProxyProvider({ httpClient: http, endpoints, map });
    expect(await provider.listProxies()).toEqual([{ id: 'p1' }, { id: 'p2' }]);
  });

  it('purchases a proxy and returns the vendor id + endpoint', async () => {
    const http = fakeHttp({ 'https://vendor/buy': { data: { id: 'px9', endpoint: { host: 'h', port: 8080 } } } });
    const provider = createHttpProxyProvider({ httpClient: http, endpoints, map });
    const res = await provider.purchase({ type: 'residential', geo: 'us' });
    expect(res).toMatchObject({ proxyId: 'px9', endpoint: { host: 'h', port: 8080 } });
    expect(http.calls[0].body).toEqual({ type: 'residential', geo: 'us', gb: undefined });
  });

  it('fails safe when purchase returns no id', async () => {
    const http = fakeHttp({ 'https://vendor/buy': { data: {} } });
    const provider = createHttpProxyProvider({ httpClient: http, endpoints, map });
    await expect(provider.purchase({})).rejects.toMatchObject({ code: 'PROXY_PURCHASE_FAILED' });
  });

  it('healthCheck proves liveness by fact via verifyProxy', async () => {
    const provider = createHttpProxyProvider({
      httpClient: fakeHttp({}),
      endpoints,
      map,
      resolveEndpoint: async () => ({ host: 'h', port: 8080 }),
      verifyProxy: async () => ({ effectiveIp: '9.9.9.9' })
    });
    expect(await provider.healthCheck('p1')).toEqual({ ok: true, ip: '9.9.9.9' });
  });

  it('healthCheck fails safe when the endpoint is unresolved', async () => {
    const provider = createHttpProxyProvider({ httpClient: fakeHttp({}), endpoints, map, resolveEndpoint: async () => null });
    expect(await provider.healthCheck('p1')).toMatchObject({ ok: false, error: 'PROXY_ENDPOINT_UNRESOLVED' });
  });

  it('errors when a needed endpoint is unconfigured (honest seam)', async () => {
    const provider = createHttpProxyProvider({ httpClient: fakeHttp({}), endpoints: {}, map });
    await expect(provider.purchase({})).rejects.toMatchObject({ code: 'PROXY_VENDOR_UNCONFIGURED' });
  });
});
