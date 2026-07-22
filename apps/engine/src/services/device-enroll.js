import { domainError } from '@acq/engine-domain';

// Generic device enrollment service (TZ §4/§5.1). Registers a cloud-phone into
// the fleet as an EngineDevice row for ANY provider (vmos/duoplus/geelark/…).
// Verify-by-fact: when a matching provider is wired, the device's existence is
// CONFIRMED via describeInstance and its raw descriptor is stored (no phantom
// enrollment); with no provider, an operator-managed device is enrolled from the
// supplied facts. Normalized fields (capacity/status/name/region) are asserted
// by the caller — vendor-specific field mapping stays a verify-by-fact seam.
export async function enrollDevice(ctx, { provider, providerDeviceId, name = '', region = '', capacity, status = 'stopped' }) {
  if (!providerDeviceId) throw domainError('PROVIDER_DEVICE_ID_REQUIRED', 'providerDeviceId is required to enroll a device');

  let providerMeta;
  const wired = ctx.provider;
  if (wired && (!provider || wired.type === provider) && typeof wired.describeInstance === 'function') {
    const descriptor = await wired.describeInstance(providerDeviceId);
    if (!descriptor) throw domainError('DEVICE_NOT_FOUND_AT_PROVIDER', `device ${providerDeviceId} not found at ${wired.type}`);
    providerMeta = descriptor;
  }

  const $set = {
    provider: provider ?? wired?.type ?? 'vmos',
    providerDeviceId,
    name,
    region,
    status,
    ...(capacity ? { capacity } : {}),
    ...(providerMeta ? { providerMeta } : {})
  };

  const doc = await ctx.deviceModel.findOneAndUpdate(
    { providerDeviceId },
    { $set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { deviceId: String(doc._id), providerDeviceId, provider: doc.provider, status: doc.status };
}
