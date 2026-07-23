import { assignProxy, releaseProxy, selectHealthyProxy } from '@acq/proxy';

// Shared proxy ops (TZ §5.9/§11) — 1:1 sticky device↔proxy over the pure @acq/proxy
// domain, persisted to the EngineProxy pool. Vendor purchase/health (a real
// ProxyProvider adapter) is not wired yet, so the health facts are read from the
// stored pool; auto-selection routes only through proxies proven healthy
// (PROXY_POOL_EMPTY otherwise). No duplicated assignment logic — the domain owns it.
const domainProxy = (doc) => ({ ...doc, proxyId: String(doc._id) });

export async function proxyStatus(ctx, { deviceId } = {}) {
  const proxies = await ctx.proxyRepo.list(deviceId ? { assignedDeviceId: deviceId } : {});
  return { proxies };
}

async function persistAssignment(ctx, doc, deviceId) {
  const assigned = assignProxy(domainProxy(doc), deviceId); // 1:1 sticky guard (PROXY_ASSIGN_FAILED)
  await ctx.proxyRepo.save({ _id: doc._id, version: doc.version, status: 'assigned', assignedDeviceId: deviceId, health: assigned.health });
  return String(doc._id);
}

export async function assignDeviceProxy(ctx, { deviceId, proxyId, geo }) {
  let doc;
  if (proxyId) {
    doc = await ctx.proxyRepo.findById(proxyId);
    if (!doc) throw Object.assign(new Error('PROXY_NOT_FOUND: proxy not found'), { code: 'PROXY_NOT_FOUND' });
  } else {
    const pool = await ctx.proxyRepo.findAvailable({ geo });
    doc = selectHealthyProxy(pool.map(domainProxy)); // throws PROXY_POOL_EMPTY when none healthy
  }
  const id = await persistAssignment(ctx, doc, deviceId);
  return { deviceId, proxyId: id, assigned: true };
}

export async function rotateDeviceProxy(ctx, { deviceId, geo }) {
  const current = await ctx.proxyRepo.findByDevice(deviceId);
  const from = current ? String(current._id) : null;
  if (current) {
    const released = releaseProxy(domainProxy(current));
    await ctx.proxyRepo.save({ _id: current._id, version: current.version, status: 'available', assignedDeviceId: '', health: released.health });
  }
  const pool = (await ctx.proxyRepo.findAvailable({ geo })).filter((p) => String(p._id) !== from);
  const next = selectHealthyProxy(pool.map(domainProxy));
  const to = await persistAssignment(ctx, next, deviceId);
  return { deviceId, from, to };
}
