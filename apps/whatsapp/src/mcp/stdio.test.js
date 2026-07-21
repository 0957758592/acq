import { startStdio } from './stdio.js';

// Fully hermetic: every collaborator is injected as a fake so no real ctx is
// built, no real MCP server is created, and no stdio transport is opened.
class FakeTransport {}

function makeFakes() {
  const logger = { error() {}, info() {} };
  const ctx = { eventBus: { subscribe() {} }, logger };
  const attached = [];
  const core = {
    server: {},
    attachTransport: async (transport) => {
      attached.push(transport);
    },
    start() {}
  };
  const bridgeCalls = [];
  return {
    ctx,
    core,
    attached,
    bridgeCalls,
    buildCtx: () => ctx,
    createCore: () => core,
    bridge: (args) => {
      bridgeCalls.push(args);
    },
    TransportClass: FakeTransport
  };
}

describe('startStdio', () => {
  it('bridges notifications once with { eventBus, server, logger }', async () => {
    const f = makeFakes();
    await startStdio({
      buildCtx: f.buildCtx,
      createCore: f.createCore,
      bridge: f.bridge,
      TransportClass: f.TransportClass
    });
    expect(f.bridgeCalls).toHaveLength(1);
    expect(f.bridgeCalls[0]).toEqual({
      eventBus: f.ctx.eventBus,
      server: f.core.server,
      logger: f.ctx.logger
    });
    // The logger must be threaded through so dead-transport failures are observable.
    expect(f.bridgeCalls[0].logger).toBe(f.ctx.logger);
  });

  it('attaches exactly one transport that is an instance of the injected TransportClass', async () => {
    const f = makeFakes();
    await startStdio({
      buildCtx: f.buildCtx,
      createCore: f.createCore,
      bridge: f.bridge,
      TransportClass: f.TransportClass
    });
    expect(f.attached).toHaveLength(1);
    expect(f.attached[0]).toBeInstanceOf(FakeTransport);
  });

  it('returns the core produced by createCore', async () => {
    const f = makeFakes();
    const result = await startStdio({
      buildCtx: f.buildCtx,
      createCore: f.createCore,
      bridge: f.bridge,
      TransportClass: f.TransportClass
    });
    expect(result).toBe(f.core);
  });
});
