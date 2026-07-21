import {
  createQueue, depth, hasFreeActiveSlot, needsFill,
  enqueueWaiting, promoteNext, evict
} from './device-queue.js';

function q(overrides = {}) {
  return createQueue({ deviceId: 'd1', activeSlots: 1, targetDepth: 3, ...overrides });
}

describe('DeviceWhatsappQueue', () => {
  it('starts empty and needs filling', () => {
    const queue = q();
    expect(depth(queue)).toBe(0);
    expect(needsFill(queue)).toBe(true);
    expect(queue.version).toBe(0);
  });

  it('enqueues waiting accounts up to targetDepth and bumps version', () => {
    let queue = enqueueWaiting(q(), 'a1');
    queue = enqueueWaiting(queue, 'a2');
    expect(queue.waitingAccountIds).toEqual(['a1', 'a2']);
    expect(depth(queue)).toBe(2);
    expect(queue.version).toBe(2);
  });

  it('ignores duplicate enqueue', () => {
    let queue = enqueueWaiting(q(), 'a1');
    queue = enqueueWaiting(queue, 'a1');
    expect(queue.waitingAccountIds).toEqual(['a1']);
  });

  it('refuses to enqueue beyond targetDepth', () => {
    let queue = q({ targetDepth: 1 });
    queue = enqueueWaiting(queue, 'a1');
    expect(() => enqueueWaiting(queue, 'a2')).toThrow('QUEUE_FULL');
  });

  it('promotes the next waiting into a free active slot', () => {
    let queue = enqueueWaiting(enqueueWaiting(q(), 'a1'), 'a2');
    expect(hasFreeActiveSlot(queue)).toBe(true);
    const { queue: after, promotedId } = promoteNext(queue);
    expect(promotedId).toBe('a1');
    expect(after.activeAccountIds).toEqual(['a1']);
    expect(after.waitingAccountIds).toEqual(['a2']);
    expect(hasFreeActiveSlot(after)).toBe(false);
  });

  it('returns null promotedId when no free active slot', () => {
    let queue = enqueueWaiting(q(), 'a1');
    queue = promoteNext(queue).queue;
    const { promotedId } = promoteNext(enqueueWaiting(queue, 'a2'));
    expect(promotedId).toBeNull();
  });

  it('evicts from active and waiting', () => {
    let queue = enqueueWaiting(enqueueWaiting(q(), 'a1'), 'a2');
    queue = promoteNext(queue).queue;
    queue = evict(queue, 'a1');
    expect(queue.activeAccountIds).toEqual([]);
    expect(queue.waitingAccountIds).toEqual(['a2']);
  });
});
