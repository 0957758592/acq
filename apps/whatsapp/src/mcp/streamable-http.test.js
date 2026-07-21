import http from 'node:http';
import { bearerAuth, createHttpApp } from './streamable-http.js';

// We unit-test the security-critical, deterministic part: the bearer-auth
// middleware. The full StreamableHTTP transport needs a live MCP client to
// exercise, so it is intentionally out of scope here (covered by the import
// smoke + a manual/integration run).
//
// The middleware uses the real `getAuthTokenFromRequest` header parser, so the
// fake req only needs a `headers` bag; the fake res records status/json.
function makeRes() {
  return {
    code: undefined,
    body: undefined,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function makeReq(headers = {}) {
  return { headers };
}

function makeNext() {
  const calls = [];
  const next = (...args) => calls.push(args);
  next.calls = calls;
  return next;
}

describe('bearerAuth', () => {
  it('rejects a request with no Authorization header (401, UNAUTHORIZED, next not called)', () => {
    const mw = bearerAuth('secret-token');
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(res.code).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(next.calls).toHaveLength(0);
  });

  it('rejects a wrong bearer token (401, next not called)', () => {
    const mw = bearerAuth('secret-token');
    const req = makeReq({ authorization: 'Bearer nope' });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(res.code).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(next.calls).toHaveLength(0);
  });

  it('accepts the correct bearer token (next called once, no 401)', () => {
    const mw = bearerAuth('secret-token');
    const req = makeReq({ authorization: 'Bearer secret-token' });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(next.calls).toHaveLength(1);
    expect(res.code).toBeUndefined();
    expect(res.body).toBeUndefined();
  });

  it('fails closed when no expected token is configured, even if a token is presented', () => {
    const mw = bearerAuth('');
    const req = makeReq({ authorization: 'Bearer anything' });
    const res = makeRes();
    const next = makeNext();

    mw(req, res, next);

    expect(res.code).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(next.calls).toHaveLength(0);
  });
});

describe('createHttpApp secure headers (helmet)', () => {
  // Integration-style: boot the real Express app (with fakes for core/transport
  // so no Mongo/RabbitMQ/real transport is touched) and hit /health over a real
  // socket. Helmet is mounted FIRST, so its headers must appear on EVERY route,
  // including the unauthenticated health probe.
  function fakeCtx() {
    return { eventBus: { subscribe() {} }, logger: { error() {}, info() {} } };
  }

  it('applies helmet security headers to the /health response', async () => {
    const app = await createHttpApp(fakeCtx(), {
      expectedToken: 't',
      createCore: () => ({ server: {}, attachTransport: async () => {} }),
      bridge: () => {},
      TransportClass: class {
        constructor() {}
        async handleRequest() {}
      },
      sessionId: () => 'session-1'
    });

    const server = app.listen(0);
    try {
      await new Promise((resolve) => server.once('listening', resolve));
      const { port } = server.address();

      const res = await new Promise((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port, path: '/health' }, (r) => {
            r.resume();
            resolve(r);
          })
          .on('error', reject);
      });

      expect(res.statusCode).toBe(200);
      // A representative helmet default header — proves helmet() is mounted.
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('createHttpApp notification bridge', () => {
  class FakeTransport {}

  it('threads ctx.logger into bridgeNotifications so dead-transport failures are observable', async () => {
    const logger = { error() {}, info() {} };
    const ctx = { eventBus: { subscribe() {} }, logger };
    const core = { server: {}, attachTransport: async () => {} };
    const bridgeCalls = [];

    await createHttpApp(ctx, {
      expectedToken: 'secret-token',
      createCore: () => core,
      bridge: (args) => bridgeCalls.push(args),
      TransportClass: FakeTransport,
      sessionId: () => 'session-1'
    });

    expect(bridgeCalls).toHaveLength(1);
    expect(bridgeCalls[0]).toEqual({ eventBus: ctx.eventBus, server: core.server, logger });
    expect(bridgeCalls[0].logger).toBe(logger);
  });
});
