import { EngineProxy, PROXY_TYPES, PROXY_STATUSES } from './engine-proxy.model.js';

describe('EngineProxy model', () => {
  it('validates clean with provider + providerProxyId and applies defaults', () => {
    const doc = new EngineProxy({ provider: 'vmos', providerProxyId: 'px-1' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.type).toBe('residential');
    expect(doc.rotation).toBe('static');
    expect(doc.status).toBe('available');
    expect(doc.version).toBe(0);
    expect(doc.health.ok).toBe(false);
    expect(doc.assignedDeviceId).toBe('');
  });

  it('requires provider and providerProxyId', () => {
    expect(new EngineProxy({}).validateSync()).toBeDefined();
    expect(new EngineProxy({ provider: 'vmos' }).validateSync()).toBeDefined();
  });

  it('rejects an unknown proxy type', () => {
    const doc = new EngineProxy({ provider: 'vmos', providerProxyId: 'px-1', type: 'satellite' });
    expect(doc.validateSync()).toBeDefined();
  });

  it('exposes the type and status vocabularies', () => {
    expect(PROXY_TYPES).toEqual(expect.arrayContaining(['residential', 'mobile', 'datacenter']));
    expect(PROXY_STATUSES).toEqual(expect.arrayContaining(['available', 'assigned', 'unhealthy', 'retired']));
  });
});
