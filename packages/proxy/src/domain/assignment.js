import { proxyError } from '../errors.js';

// 1:1 sticky assignment (TZ §5.9): a proxy belongs to at most one device. The
// account behind it keeps a stable IP; changing it is a controlled release +
// re-assign. Pure: returns a new proxy, never mutates the input.
export function assignProxy(proxy, deviceId) {
  const current = proxy.assignedDeviceId || null;
  if (current && current !== deviceId) {
    throw proxyError(
      'PROXY_ASSIGN_FAILED',
      `proxy ${proxy.proxyId} is already assigned to device ${current}`
    );
  }
  return { ...proxy, assignedDeviceId: deviceId };
}

export function releaseProxy(proxy) {
  return { ...proxy, assignedDeviceId: null };
}
