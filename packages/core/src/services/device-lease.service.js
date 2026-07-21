import { claimMongoLease, releaseMongoLease, renewMongoLease } from '@acq/shared';
import { EngineDevice } from '@acq/core/models/engine-device';

const DEFAULT_DEVICE_LEASE_TTL_MS = 10 * 60 * 1000;

export async function claimRunningDeviceLease({
  owner,
  ttlMs = DEFAULT_DEVICE_LEASE_TTL_MS,
  deviceId = null
} = {}) {
  const filter = {
    status: 'running'
  };
  if (deviceId) filter._id = deviceId;

  return claimMongoLease(EngineDevice, {
    owner,
    ttlMs,
    filter,
    sort: { leasedUntil: 1, updatedAt: 1, _id: 1 }
  });
}

export async function renewDeviceLease(deviceId, owner, ttlMs = DEFAULT_DEVICE_LEASE_TTL_MS) {
  return renewMongoLease(EngineDevice, deviceId, { owner, ttlMs });
}

export async function releaseDeviceLease(deviceId, owner) {
  return releaseMongoLease(EngineDevice, deviceId, { owner });
}
