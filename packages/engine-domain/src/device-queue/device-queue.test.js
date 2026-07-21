import {
  createQueue,
  depth,
  hasFreeActiveSlot,
  needsFill,
  enqueueWaiting,
  promoteNext,
  evict
} from './device-queue.js';
import { DomainError } from '../errors.js';

describe('createQueue', () => {
  test('carries platform in the key and applies defaults', () => {
    const q = createQueue({ deviceId: 'd1', platform: 'telegram' });
    expect(q.deviceId).toBe('d1');
    expect(q.platform).toBe('telegram');
    expect(q.activeSlots).toBe(1);
    expect(q.targetDepth).toBe(3);
    expect(q.version).toBe(0);
  });
});

describe('queue depth helpers', () => {
  const q = createQueue({ deviceId: 'd1', platform: 'tg', targetDepth: 2 });
  test('needsFill true when below targetDepth', () => {
    expect(needsFill(q)).toBe(true);
  });
  test('hasFreeActiveSlot true on an empty queue', () => {
    expect(hasFreeActiveSlot(q)).toBe(true);
  });
});

describe('enqueueWaiting', () => {
  test('adds a waiting account and bumps version', () => {
    const q = enqueueWaiting(createQueue({ deviceId: 'd1', platform: 'tg' }), 'a1');
    expect(q.waitingAccountIds).toEqual(['a1']);
    expect(q.version).toBe(1);
    expect(depth(q)).toBe(1);
  });

  test('is idempotent for an already-known account', () => {
    let q = enqueueWaiting(createQueue({ deviceId: 'd1', platform: 'tg' }), 'a1');
    q = enqueueWaiting(q, 'a1');
    expect(q.waitingAccountIds).toEqual(['a1']);
  });

  test('throws QUEUE_FULL at targetDepth', () => {
    let q = createQueue({ deviceId: 'd1', platform: 'tg', targetDepth: 1 });
    q = enqueueWaiting(q, 'a1');
    try {
      enqueueWaiting(q, 'a2');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe('QUEUE_FULL');
    }
  });
});

describe('promoteNext', () => {
  test('promotes the first waiting account into an active slot', () => {
    let q = createQueue({ deviceId: 'd1', platform: 'tg' });
    q = enqueueWaiting(q, 'a1');
    const { queue, promotedId } = promoteNext(q);
    expect(promotedId).toBe('a1');
    expect(queue.activeAccountIds).toEqual(['a1']);
    expect(queue.waitingAccountIds).toEqual([]);
  });

  test('no-op when no free slot', () => {
    let q = createQueue({ deviceId: 'd1', platform: 'tg', activeSlots: 1 });
    q = enqueueWaiting(q, 'a1');
    q = promoteNext(q).queue;
    q = enqueueWaiting(q, 'a2');
    const { promotedId } = promoteNext(q);
    expect(promotedId).toBeNull();
  });
});

describe('evict', () => {
  test('removes an account from both lists', () => {
    let q = createQueue({ deviceId: 'd1', platform: 'tg' });
    q = enqueueWaiting(q, 'a1');
    q = promoteNext(q).queue;
    q = evict(q, 'a1');
    expect(q.activeAccountIds).toEqual([]);
    expect(q.waitingAccountIds).toEqual([]);
  });
});
