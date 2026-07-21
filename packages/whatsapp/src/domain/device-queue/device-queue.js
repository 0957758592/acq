import { domainError } from '../errors.js';

export function createQueue({ deviceId, activeSlots = 1, targetDepth = 3 }) {
  return Object.freeze({
    deviceId,
    activeSlots,
    targetDepth,
    activeAccountIds: [],
    waitingAccountIds: [],
    version: 0
  });
}

export function depth(queue) {
  return queue.activeAccountIds.length + queue.waitingAccountIds.length;
}

export function hasFreeActiveSlot(queue) {
  return queue.activeAccountIds.length < queue.activeSlots;
}

export function needsFill(queue) {
  return depth(queue) < queue.targetDepth;
}

function bump(queue, patch) {
  return Object.freeze({ ...queue, ...patch, version: queue.version + 1 });
}

export function enqueueWaiting(queue, accountId) {
  if (queue.activeAccountIds.includes(accountId) || queue.waitingAccountIds.includes(accountId)) {
    return queue;
  }
  if (depth(queue) >= queue.targetDepth) {
    throw domainError('QUEUE_FULL', `Queue for ${queue.deviceId} is at targetDepth`);
  }
  return bump(queue, { waitingAccountIds: [...queue.waitingAccountIds, accountId] });
}

export function promoteNext(queue) {
  if (!hasFreeActiveSlot(queue) || queue.waitingAccountIds.length === 0) {
    return { queue, promotedId: null };
  }
  const [promotedId, ...rest] = queue.waitingAccountIds;
  const after = bump(queue, {
    activeAccountIds: [...queue.activeAccountIds, promotedId],
    waitingAccountIds: rest
  });
  return { queue: after, promotedId };
}

export function evict(queue, accountId) {
  return bump(queue, {
    activeAccountIds: queue.activeAccountIds.filter((id) => id !== accountId),
    waitingAccountIds: queue.waitingAccountIds.filter((id) => id !== accountId)
  });
}
