import { assertTransition } from './status.js';
import { normalizeMsisdn } from '../msisdn.js';
import { domainError } from '../errors.js';

export function createAccount(input, { clock }) {
  const now = clock().toISOString();
  return Object.freeze({
    id: input.id,
    msisdn: normalizeMsisdn(input.msisdn),
    source: input.source,
    secretRefs: input.secretRefs || {},
    status: 'purchased',
    assignedDeviceId: input.assignedDeviceId ?? null,
    health: { consecutiveFailures: 0, lastProbeAt: null },
    version: 0,
    createdAt: now,
    updatedAt: now
  });
}

function next(account, patch, { clock }) {
  return Object.freeze({
    ...account,
    ...patch,
    version: account.version + 1,
    updatedAt: clock().toISOString()
  });
}

export function assignToDevice(account, deviceId) {
  if (!deviceId) throw domainError('DEVICE_ID_REQUIRED', 'deviceId is required');
  return Object.freeze({
    ...account,
    assignedDeviceId: deviceId,
    version: account.version + 1
  });
}

export function transition(account, to, { clock }) {
  assertTransition(account.status, to);
  if (to === 'online' && !account.assignedDeviceId) {
    throw domainError('ACCOUNT_TRANSITION_INVALID', 'online requires an assigned device');
  }
  return next(account, { status: to }, { clock });
}

export function recordProbe(account, result, { clock }) {
  const consecutiveFailures = result.healthy ? 0 : account.health.consecutiveFailures + 1;
  return next(account, {
    health: { consecutiveFailures, lastProbeAt: clock().toISOString() }
  }, { clock });
}
