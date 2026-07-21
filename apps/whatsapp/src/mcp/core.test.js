import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import { createMcpCore } from './core.js';

// Fake low-level Server: records handlers + the connected transport so the core can be
// exercised without a real MCP transport.
class FakeServer {
  constructor(info, opts) {
    this.info = info;
    this.opts = opts;
    this.handlers = new Map();
    this.connected = null;
  }

  setRequestHandler(schema, handler) {
    this.handlers.set(schema, handler);
  }

  async connect(transport) {
    this.connected = transport;
  }
}

function makeCtx(over = {}) {
  return {
    accountRepo: { countAvailable: async () => 7, find: async () => [], save: async () => {} },
    deviceQueueRepo: { ensureQueue: async () => ({}), find: async () => ({}), listAll: async () => [] },
    reportRepo: {
      createCampaign: async (input) => ({ _id: 'c1', ...input }),
      findCampaign: async () => null,
      setCampaignStatus: async (id, status) => ({ _id: id, status })
    },
    jobDispatcher: { dispatch: async () => ({ queued: true }) },
    config: { poolThreshold: 10, buyBatchSize: 5, deviceTargetDepth: 3, autobuyEnabled: true },
    clock: { now: () => new Date('2026-07-09T12:00:00.000Z') },
    logger: { error: () => {} },
    ...over
  };
}

function makeCore(over = {}) {
  const ctx = makeCtx(over);
  const core = createMcpCore(ctx, { ServerClass: FakeServer });
  return { ctx, core, server: core.server };
}

describe('createMcpCore', () => {
  it('registers the four MCP request handlers', () => {
    const { server } = makeCore();
    expect(server.handlers.has(ListToolsRequestSchema)).toBe(true);
    expect(server.handlers.has(CallToolRequestSchema)).toBe(true);
    expect(server.handlers.has(ListResourcesRequestSchema)).toBe(true);
    expect(server.handlers.has(ReadResourceRequestSchema)).toBe(true);
    expect(server.handlers.size).toBe(4);
  });

  it('constructs the server with name/version and tools+resources capabilities', () => {
    const { server } = makeCore();
    expect(server.info).toEqual({ name: 'whatsapp-report', version: '0.1.0' });
    expect(server.opts.capabilities).toEqual({ tools: {}, resources: {} });
  });

  it('ListTools handler returns descriptors with name/description/inputSchema and no handler/yupSchema leak', async () => {
    const { server } = makeCore();
    const listTools = server.handlers.get(ListToolsRequestSchema);
    const result = await listTools({});
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    for (const t of result.tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(t.inputSchema.type).toBe('object');
      expect('handler' in t).toBe(false);
      expect('yupSchema' in t).toBe(false);
    }
  });

  it('CallTool handler wraps a successful result as JSON text content', async () => {
    const { server } = makeCore();
    const callTool = server.handlers.get(CallToolRequestSchema);
    const result = await callTool({ params: { name: 'pool.status', arguments: {} } });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ available: 7, threshold: 10, autobuyEnabled: true }) }
    ]);
  });

  it('CallTool handler throws McpError(MethodNotFound) for an unknown tool', async () => {
    const { server } = makeCore();
    const callTool = server.handlers.get(CallToolRequestSchema);
    await expect(callTool({ params: { name: 'does.not.exist', arguments: {} } })).rejects.toThrow(McpError);
    await expect(callTool({ params: { name: 'does.not.exist', arguments: {} } })).rejects.toMatchObject({
      code: ErrorCode.MethodNotFound
    });
  });

  it('CallTool handler maps invalid args to McpError(InvalidParams) — not the raw domain error', async () => {
    const { server } = makeCore();
    const callTool = server.handlers.get(CallToolRequestSchema);
    let thrown;
    try {
      await callTool({ params: { name: 'pool.buy', arguments: { quantity: 0 } } });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect(thrown.code).toBe(ErrorCode.InvalidParams);
  });

  it('ListResources handler returns the static resource list', async () => {
    const { server } = makeCore();
    const listResources = server.handlers.get(ListResourcesRequestSchema);
    const result = await listResources({});
    expect(result.resources).toEqual([
      { uri: 'whatsapp://pool/summary', name: 'Pool summary', mimeType: 'application/json' },
      { uri: 'whatsapp://devices', name: 'Devices', mimeType: 'application/json' }
    ]);
  });

  it('ReadResource handler returns JSON contents for a known uri', async () => {
    const { server } = makeCore();
    const readResource = server.handlers.get(ReadResourceRequestSchema);
    const result = await readResource({ params: { uri: 'whatsapp://pool/summary' } });
    expect(result.contents).toEqual([
      {
        uri: 'whatsapp://pool/summary',
        mimeType: 'application/json',
        text: JSON.stringify({ available: 7, threshold: 10, autobuyEnabled: true })
      }
    ]);
  });

  it('ReadResource handler maps a missing resource to a mapped McpError', async () => {
    const { server } = makeCore();
    const readResource = server.handlers.get(ReadResourceRequestSchema);
    let thrown;
    try {
      await readResource({ params: { uri: 'whatsapp://campaigns/missing' } });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect(thrown.code).toBe(ErrorCode.InvalidParams);
  });

  it('attachTransport connects the transport on the underlying server', async () => {
    const { core, server } = makeCore();
    const transport = { id: 'fake-transport' };
    await core.attachTransport(transport);
    expect(server.connected).toBe(transport);
  });

  it('exposes an idempotent start() that resolves', async () => {
    const { core } = makeCore();
    await expect(core.start()).resolves.toBeUndefined();
  });
});
