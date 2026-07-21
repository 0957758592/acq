import { DeviceControlError } from './errors.js';

// The core DeviceProvider port surface (TZ §4/§5.1) — every device adapter
// (vmos, duoplus, +geelark, +matt-duo, emulators/ADB…) MUST implement these so
// the engine can drive any provider without branching on vendor. Optional,
// vendor-specific capabilities (provisionApps, pushFileByUrl, tikTokTask) are
// declared per adapter via `provider.capabilities` instead of forced stubs.
export const DEVICE_PROVIDER_REQUIRED_METHODS = Object.freeze([
  'listDevices',
  'describeInstance',
  'startDevice',
  'stopDevice',
  'createDirectController',
  'screenshot',
  'setSmartIp'
]);

export const DEVICE_PROVIDER_CAPABILITIES = Object.freeze([
  'provisionApps',
  'pushFileByUrl',
  'tikTokTask'
]);

// Single shared contract check run against ALL adapters (§5.1 DoD). Fail-safe:
// a missing method or type is a hard, coded error — never a silent gap.
export function assertDeviceProviderContract(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new DeviceControlError('device provider must be an object', {
      code: 'DEVICE_PROVIDER_CONTRACT_VIOLATION'
    });
  }
  if (typeof provider.type !== 'string' || !provider.type) {
    throw new DeviceControlError('device provider must expose a non-empty string `type`', {
      code: 'DEVICE_PROVIDER_CONTRACT_VIOLATION'
    });
  }
  const missing = DEVICE_PROVIDER_REQUIRED_METHODS.filter((m) => typeof provider[m] !== 'function');
  if (missing.length) {
    throw new DeviceControlError(
      `device provider '${provider.type}' is missing required methods: ${missing.join(', ')}`,
      { code: 'DEVICE_PROVIDER_CONTRACT_VIOLATION', details: { missing } }
    );
  }
}
