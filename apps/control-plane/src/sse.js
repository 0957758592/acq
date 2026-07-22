// Server-Sent Events surface for domain events (TZ §11.5). One-way stream of
// EVENT_TYPES to subscribers (dashboards, brain). The event source is the
// EventBus (Redis pub/sub); injected so it is testable.
export function formatSseFrame(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function attachEventStream(res, eventSource, { types = ['*'] } = {}) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  });
  res.write(': connected\n\n');

  const onEvent = (event) => {
    res.write(formatSseFrame(event));
    res.flush?.();
  };
  const unsubscribers = types.map((t) => eventSource.subscribe(t, onEvent));

  const cleanup = () => unsubscribers.forEach((u) => u?.());
  res.on('close', cleanup);
  return cleanup;
}
