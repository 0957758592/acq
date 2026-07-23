// Errors
export { DomainError, domainError } from './errors.js';

// Account aggregate + state machine
export { ACCOUNT_STATES, canTransition, assertTransition } from './account/status.js';
export { createAccount, assignToDevice, transition, recordProbe, markCheckpoint } from './account/account.js';

// Value Objects
export { normalizeMsisdn } from './value-objects/msisdn.js';
export { normalizeHandle } from './value-objects/handle.js';
export { normalizeEmail } from './value-objects/email.js';
export { normalizeIdentifier } from './value-objects/identifier.js';
export { parseProxyUrl } from './value-objects/proxy-url.js';

// Pool + device-queue
export { needsReplenish, buyQuantity } from './pool/pool-policy.js';
export {
  createQueue,
  depth,
  hasFreeActiveSlot,
  needsFill,
  enqueueWaiting,
  promoteNext,
  evict,
  isMember
} from './device-queue/device-queue.js';

// Campaign + action
export { ACTION_TYPES, ACTION_STRATEGIES, actionTaskKey, expandActionTasks } from './campaign/action.js';

// Events
export { EVENT_TYPES, makeEvent, isKnownEventType } from './events/events.js';

// Reconcile
export { reconcile } from './reconcile/reconcile.js';

// Ports (typedefs)
export { PORTS } from './ports/index.js';
