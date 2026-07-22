import { formatSseFrame, attachEventStream } from './sse.js';

function fakeRes() {
  const writes = [];
  const handlers = {};
  return {
    writes,
    headers: null,
    writeHead(code, headers) {
      this.code = code;
      this.headers = headers;
    },
    write: (chunk) => writes.push(chunk),
    on: (evt, cb) => {
      handlers[evt] = cb;
    },
    emit: (evt) => handlers[evt]?.(),
    flush: () => {}
  };
}

function fakeEventSource() {
  const subs = [];
  return {
    subs,
    subscribe: (_type, handler) => {
      subs.push(handler);
      return () => {
        const i = subs.indexOf(handler);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    emit: (event) => subs.forEach((h) => h(event))
  };
}

describe('formatSseFrame', () => {
  test('encodes an event as an SSE data frame', () => {
    expect(formatSseFrame({ type: 'account.online', payload: { id: 'a1' } })).toBe(
      'event: account.online\ndata: {"type":"account.online","payload":{"id":"a1"}}\n\n'
    );
  });
});

describe('attachEventStream', () => {
  test('writes SSE headers and streams subsequent events', () => {
    const res = fakeRes();
    const source = fakeEventSource();
    attachEventStream(res, source);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    source.emit({ type: 'pool.low', payload: { available: 2 } });
    expect(res.writes.join('')).toContain('event: pool.low');
  });

  test('unsubscribes when the client disconnects', () => {
    const res = fakeRes();
    const source = fakeEventSource();
    attachEventStream(res, source);
    expect(source.subs).toHaveLength(1);
    res.emit('close');
    expect(source.subs).toHaveLength(0);
  });
});
