import { assertTransition } from './status.js';
import { domainError } from '../errors.js';

// Generic, platform-parameterized account aggregate (TZ §3.1). Immutable
// (Object.freeze) with a monotonic `version` for optimistic locking. Identity
// is the raw `identifier` (Value-Object validation happens at the edge via the
// platform's identifierVO); `platform` is fixed for the account's lifetime.
export function createAccount(input, { clock }) {
  const now = clock().toISOString();
  return Object.freeze({
    id: input.id,
    platform: input.platform,
    identifier: input.identifier,
    source: input.source,
    shopId: input.shopId ?? null,
    secretRefs: input.secretRefs || {},
    status: 'acquired',
    assignedDeviceId: input.assignedDeviceId ?? null,
    assignedProxyId: input.assignedProxyId ?? null,
    health: { consecutiveFailures: 0, lastProbeAt: null },
    checkpointReason: null,
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
  return next(account, { health: { consecutiveFailures, lastProbeAt: clock().toISOString() } }, { clock });
}

// Checkpoint (verification wall) is reachable from bringing_online/online.
export function markCheckpoint(account, reason, { clock }) {
  assertTransition(account.status, 'checkpointed');
  return next(account, { status: 'checkpointed', checkpointReason: reason ?? null }, { clock });
}
