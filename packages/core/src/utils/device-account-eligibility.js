function deviceLabel(device = {}) {
  return device.providerDeviceId || device.name || String(device._id || 'device');
}

function subscriptionExpiresInFuture(value) {
  if (!value) return true;
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function canDeviceAcceptAccount(device, _platform, { maxAccountsPerDevice } = {}) {
  if (!device) {
    return {
      ok: false,
      status: 404,
      code: 'DEVICE_NOT_FOUND',
      message: 'Device not found'
    };
  }

  // DuoPlus subscription gate (a device without an active subscription is unusable).
  if (device.provider === 'duoplus') {
    const meta = device.providerMeta || {};
    const status = String(meta.subscriptionStatus || '').trim().toLowerCase();
    const hasVerifiedSubscription = meta.subscriptionVerified === true && status === 'active';
    const subscriptionNotExpired = subscriptionExpiresInFuture(meta.subscriptionExpiresAt);
    if (!(hasVerifiedSubscription && subscriptionNotExpired)) {
      return {
        ok: false,
        status: 409,
        code: 'DEVICE_SUBSCRIPTION_REQUIRED',
        message: `DuoPlus device ${deviceLabel(device)} does not have a verified subscription; account assignment is blocked.`
      };
    }
  }

  // Multi-account occupancy cap (TZ §5.11): a device hosts up to N accounts for
  // the platform (N = platform's maxAccountsPerDevice, else the device's
  // configured maxAccounts, default 1). Current occupancy = occupiedAccountIds
  // (falling back to the scalar activeAccountCount).
  const cap = Number(maxAccountsPerDevice ?? device.capacity?.maxAccounts ?? 1);
  const occupied = device.capacity?.occupiedAccountIds?.length ?? device.capacity?.activeAccountCount ?? 0;
  if (occupied >= cap) {
    return {
      ok: false,
      status: 409,
      code: 'DEVICE_CAPACITY_FULL',
      message: `Device ${deviceLabel(device)} is at capacity (${occupied}/${cap} accounts).`
    };
  }

  return { ok: true };
}

export function assertDeviceCanAcceptAccount(device) {
  const result = canDeviceAcceptAccount(device);
  if (result.ok) return true;
  const err = new Error(result.message);
  err.status = result.status;
  err.code = result.code;
  throw err;
}
