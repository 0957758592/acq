import { proxyStatus, assignDeviceProxy, rotateDeviceProxy } from './proxy-ops.js';

function fakeCtx(proxies) {
  const store = new Map(proxies.map((p) => [String(p._id), { ...p }]));
  return {
    saved: [],
    proxyRepo: {
      list: async (f = {}) => [...store.values()].filter((p) => (f.assignedDeviceId ? p.assignedDeviceId === f.assignedDeviceId : true)),
      findById: async (id) => store.get(String(id)) ?? null,
      findByDevice: async (deviceId) => [...store.values()].find((p) => p.assignedDeviceId === deviceId) ?? null,
      findAvailable: async ({ geo } = {}) => [...store.values()].filter((p) => p.status === 'available' && (!geo || p.geo === geo)),
      save: async (p) => { store.set(String(p._id), { ...store.get(String(p._id)), ...p }); return { ...store.get(String(p._id)) }; }
    }
  };
}

const healthy = (over) => ({ _id: 'p1', geo: 'us', status: 'available', assignedDeviceId: '', version: 0, health: { ok: true, latencyMs: 100 }, ...over });

describe('proxy-ops service (1:1 sticky, Mongo-backed)', () => {
  it('proxyStatus lists the pool, optionally filtered by device', async () => {
    const ctx = fakeCtx([healthy(), healthy({ _id: 'p2', assignedDeviceId: 'd9', status: 'assigned' })]);
    expect((await proxyStatus(ctx, {})).proxies).toHaveLength(2);
    expect((await proxyStatus(ctx, { deviceId: 'd9' })).proxies).toHaveLength(1);
  });

  it('assignDeviceProxy auto-selects a healthy available proxy and marks it assigned (1:1)', async () => {
    const ctx = fakeCtx([healthy()]);
    const res = await assignDeviceProxy(ctx, { deviceId: 'd1' });
    expect(res).toMatchObject({ deviceId: 'd1', proxyId: 'p1', assigned: true });
    expect((await ctx.proxyRepo.findById('p1')).status).toBe('assigned');
    expect((await ctx.proxyRepo.findById('p1')).assignedDeviceId).toBe('d1');
  });

  it('assignDeviceProxy honors a requested proxyId', async () => {
    const ctx = fakeCtx([healthy(), healthy({ _id: 'p2' })]);
    const res = await assignDeviceProxy(ctx, { deviceId: 'd1', proxyId: 'p2' });
    expect(res.proxyId).toBe('p2');
  });

  it('assignDeviceProxy fails safe with PROXY_POOL_EMPTY when no healthy proxy', async () => {
    const ctx = fakeCtx([healthy({ health: { ok: false } })]);
    await expect(assignDeviceProxy(ctx, { deviceId: 'd1' })).rejects.toMatchObject({ code: 'PROXY_POOL_EMPTY' });
  });

  it('assignDeviceProxy rejects double-assigning a proxy already on another device (1:1 sticky)', async () => {
    const ctx = fakeCtx([healthy({ status: 'assigned', assignedDeviceId: 'd2' })]);
    await expect(assignDeviceProxy(ctx, { deviceId: 'd1', proxyId: 'p1' })).rejects.toMatchObject({ code: 'PROXY_ASSIGN_FAILED' });
  });

  it('rotateDeviceProxy releases the current proxy and assigns another healthy one', async () => {
    const ctx = fakeCtx([
      healthy({ _id: 'p1', status: 'assigned', assignedDeviceId: 'd1' }),
      healthy({ _id: 'p2' })
    ]);
    const res = await rotateDeviceProxy(ctx, { deviceId: 'd1' });
    expect(res).toMatchObject({ deviceId: 'd1', from: 'p1', to: 'p2' });
    expect((await ctx.proxyRepo.findById('p1')).assignedDeviceId).toBe('');
    expect((await ctx.proxyRepo.findById('p2')).assignedDeviceId).toBe('d1');
  });
});
