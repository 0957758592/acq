import { createRedisEventSource } from './redis-event-source.js';

function fakeSubscriber() {
  let msgHandler = null;
  return {
    subscribed: [],
    subscribe(ch) { this.subscribed.push(ch); },
    on(evt, cb) { if (evt === 'message') msgHandler = cb; },
    emit(ch, message) { msgHandler?.(ch, message); }
  };
}

describe('createRedisEventSource', () => {
  test('fans a typed event out to matching subscribers', () => {
    const sub = fakeSubscriber();
    const src = createRedisEventSource({ subscriber: sub, channel: 'acq:events' });
    const seen = [];
    src.subscribe('account.online', (e) => seen.push(e));
    src.subscribe('*', (e) => seen.push({ all: e.type }));

    sub.emit('acq:events', JSON.stringify({ type: 'account.online', payload: { id: 'a1' } }));
    expect(seen).toContainEqual({ type: 'account.online', payload: { id: 'a1' } });
    expect(seen).toContainEqual({ all: 'account.online' });
    expect(sub.subscribed).toContain('acq:events');
  });

  test('unsubscribe stops delivery', () => {
    const sub = fakeSubscriber();
    const src = createRedisEventSource({ subscriber: sub });
    const seen = [];
    const off = src.subscribe('*', (e) => seen.push(e));
    off();
    sub.emit('acq:events', JSON.stringify({ type: 'pool.low' }));
    expect(seen).toHaveLength(0);
  });

  test('ignores malformed messages', () => {
    const sub = fakeSubscriber();
    const src = createRedisEventSource({ subscriber: sub });
    const seen = [];
    src.subscribe('*', (e) => seen.push(e));
    sub.emit('acq:events', 'not json');
    expect(seen).toHaveLength(0);
  });
});
