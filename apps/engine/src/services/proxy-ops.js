import { assignProxy, releaseProxy, selectHealthyProxy } from '@acq/proxy';

// Shared proxy ops (TZ §5.9/§11) — 1:1 sticky device↔proxy over the pure @acq/proxy
// domain, persisted to the EngineProxy pool. Vendor purchase/health (a real
// ProxyProvider adapter) is not wired yet, so the health facts are read from the
// stored pool; auto-selection routes only through proxies proven healthy
// (PROXY_POOL_EMPTY otherwise). No duplicated assignment logic — the domain owns it.
const domainProxy = (doc) => ({ ...doc, proxyId: String(doc._id) });

// Push the assigned proxy onto the REAL cloud-phone device (TZ §5.9) so the
// account's on-device traffic actually egresses through it — not just a DB record.
// Endpoint (host:port[:user:password]) is resolved from the vaulted secretRef; the
// device provider's setSmartIp applies it. No provider / no cloud phone -> a no-op
// (own-pool devices route differently). A failed apply propagates BEFORE the
// assignment is persisted, so we never record a proxy the device didn't accept.
async function applyProxyToDevice(ctx, doc, deviceId) {
  if (typeof ctx.provider?.setSmartIp !== 'function' || !ctx.deviceModel) return null;
  const found = ctx.deviceModel.findById(deviceId);
  const device = typeof found?.lean === 'function' ? await found.lean() : await found;
  if (!device?.providerDeviceId) return null;
  const raw = doc.secretRef ? await ctx.secretResolver.resolve(doc.secretRef) : '';
  const [host, port, user = '', password = ''] = String(raw).split(':');
  if (!host || !port) throw Object.assign(new Error('PROXY_ENDPOINT_UNRESOLVED: proxy endpoint missing host/port'), { code: 'PROXY_ENDPOINT_UNRESOLVED' });
  await ctx.provider.setSmartIp(device.providerDeviceId, { host, port: Number(port), user, password });
  return { providerDeviceId: device.providerDeviceId, host, port: Number(port) };
}

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
  const applied = await applyProxyToDevice(ctx, doc, deviceId); // push to the real cloud phone first
  const id = await persistAssignment(ctx, doc, deviceId);
  return { deviceId, proxyId: id, assigned: true, applied: applied ? true : false };
}

export async function rotateDeviceProxy(ctx, { deviceId, geo, force = false }) {
  const current = await ctx.proxyRepo.findByDevice(deviceId);
  const from = current ? String(current._id) : null;
  // Verify-by-fact: don't rotate a proxy that is actually healthy (unless forced)
  // — churn wastes the sticky IP. Health is proven by routing through it.
  if (current && !force && ctx.proxyHealthChecker) {
    const health = await ctx.proxyHealthChecker.check(current);
    if (health.ok) {
      await ctx.proxyRepo.save({ _id: current._id, version: current.version, status: 'assigned', assignedDeviceId: deviceId, health });
      return { deviceId, from, rotated: false, reason: 'healthy' };
    }
  }
  if (current) {
    const released = releaseProxy(domainProxy(current));
    await ctx.proxyRepo.save({ _id: current._id, version: current.version, status: 'available', assignedDeviceId: '', health: released.health });
  }
  const pool = (await ctx.proxyRepo.findAvailable({ geo })).filter((p) => String(p._id) !== from);
  const next = selectHealthyProxy(pool.map(domainProxy));
  const to = await persistAssignment(ctx, next, deviceId);
  return { deviceId, from, to, rotated: true };
}
