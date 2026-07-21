function deviceLabel(device = {}) {
  return device.providerDeviceId || device.name || String(device._id || 'device');
}

function subscriptionExpiresInFuture(value) {
  if (!value) return true;
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function canDeviceAcceptAccount(device) {
  if (!device) {
    return {
      ok: false,
      status: 404,
      code: 'DEVICE_NOT_FOUND',
      message: 'Device not found'
    };
  }

  if (device.provider !== 'duoplus') return { ok: true };

  const meta = device.providerMeta || {};
  const status = String(meta.subscriptionStatus || '').trim().toLowerCase();
  const hasVerifiedSubscription = meta.subscriptionVerified === true && status === 'active';
  const subscriptionNotExpired = subscriptionExpiresInFuture(meta.subscriptionExpiresAt);

  if (hasVerifiedSubscription && subscriptionNotExpired) return { ok: true };

  return {
    ok: false,
    status: 409,
    code: 'DEVICE_SUBSCRIPTION_REQUIRED',
    message: `DuoPlus device ${deviceLabel(device)} does not have a verified subscription; account assignment is blocked.`
  };
}

export function assertDeviceCanAcceptAccount(device) {
  const result = canDeviceAcceptAccount(device);
  if (result.ok) return true;
  const err = new Error(result.message);
  err.status = result.status;
  err.code = result.code;
  throw err;
}
