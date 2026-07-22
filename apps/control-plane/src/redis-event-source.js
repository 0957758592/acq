// Redis-backed event source for the SSE surface (TZ §11.5/§3.9). Wraps a Redis
// subscriber on the domain-event channel and fans messages out to subscribers,
// optionally filtered by event type ('*' = all). The subscriber is injectable
// so tests can drive it without a real Redis.
export function createRedisEventSource({ subscriber, channel = 'acq:events' } = {}) {
  const handlers = new Set();
  let started = false;

  function ensureStarted() {
    if (started) return;
    started = true;
    subscriber.subscribe(channel);
    subscriber.on('message', (_ch, message) => {
      let event;
      try {
        event = JSON.parse(message);
      } catch {
        return;
      }
      for (const { type, handler } of handlers) {
        if (type === '*' || type === event.type) handler(event);
      }
    });
  }

  return {
    subscribe(type, handler) {
      ensureStarted();
      const entry = { type, handler };
      handlers.add(entry);
      return () => handlers.delete(entry);
    }
  };
}
