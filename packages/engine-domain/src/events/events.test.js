import { EVENT_TYPES, makeEvent, isKnownEventType } from './events.js';

const clock = () => new Date('2026-07-22T12:00:00.000Z');

describe('EVENT_TYPES', () => {
  test('covers the generalized domain events', () => {
    expect(EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'account.acquired', 'account.online', 'account.warmed', 'account.banned',
        'account.checkpointed', 'account.retired', 'queue.low', 'pool.low',
        'campaign.completed', 'action.done', 'scrape.done', 'device.unhealthy',
        'proxy.unhealthy', 'purchase.completed'
      ])
    );
  });
});

describe('makeEvent', () => {
  test('stamps occurredAt from the clock and carries type + payload', () => {
    const evt = makeEvent('account.banned', { accountId: 'a1' }, { clock });
    expect(evt).toEqual({
      type: 'account.banned',
      occurredAt: '2026-07-22T12:00:00.000Z',
      payload: { accountId: 'a1' }
    });
  });

  test('rejects an unknown event type', () => {
    try {
      makeEvent('account.exploded', {}, { clock });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('EVENT_TYPE_UNKNOWN');
    }
  });
});

describe('isKnownEventType', () => {
  test('true for a known type, false otherwise', () => {
    expect(isKnownEventType('pool.low')).toBe(true);
    expect(isKnownEventType('nope')).toBe(false);
  });
});
