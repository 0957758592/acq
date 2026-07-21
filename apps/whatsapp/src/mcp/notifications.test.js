import { EVENT_TYPES } from '@acq/whatsapp';
import { bridgeNotifications } from './notifications.js';

function makeBus() {
  const handlers = new Map();
  return {
    handlers,
    subscribe: (type, handler) => {
      handlers.set(type, handler);
    }
  };
}

describe('bridgeNotifications', () => {
  it('subscribes once per EVENT_TYPES and returns the count', () => {
    const eventBus = makeBus();
    const server = { notification: () => {} };
    const count = bridgeNotifications({ eventBus, server });
    expect(count).toBe(EVENT_TYPES.length);
    expect([...eventBus.handlers.keys()].sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('forwards a subscribed event to server.notification with the whatsapp event method', () => {
    const eventBus = makeBus();
    const sent = [];
    const server = { notification: (msg) => sent.push(msg) };
    bridgeNotifications({ eventBus, server });

    const handler = eventBus.handlers.get('account.banned');
    handler({ type: 'account.banned', payload: { accountId: 'a1' }, occurredAt: '2026-07-09T12:00:00.000Z' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      method: 'notifications/whatsapp/event',
      params: {
        type: 'account.banned',
        payload: { accountId: 'a1' },
        occurredAt: '2026-07-09T12:00:00.000Z'
      }
    });
  });

  it('swallows server.notification errors so a dead transport never breaks the bus', () => {
    const eventBus = makeBus();
    const logged = [];
    const server = {
      notification: () => {
        throw new Error('transport closed');
      }
    };
    const logger = { error: (...args) => logged.push(args) };
    bridgeNotifications({ eventBus, server, logger });

    const handler = eventBus.handlers.get('report.done');
    expect(() => handler({ type: 'report.done', payload: {}, occurredAt: 'x' })).not.toThrow();
    expect(logged).toHaveLength(1);
  });
});
