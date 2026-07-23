import { assignDeviceProxy } from '../services/proxy-ops.js';

// assign-proxy consumer (TZ §8.3/§5.9) — binds a healthy pool proxy 1:1 to a
// device that lacks one. Reuses the shared proxy-ops service (no duplicated
// assignment logic). PROXY_POOL_EMPTY is an honest coded stop -> DLQ/retry when
// the pool has no healthy proxy (never routes work through an unproven proxy).
export async function assignProxyHandler(ctx, { deviceId, geo }) {
  return assignDeviceProxy(ctx, { deviceId, geo });
}
