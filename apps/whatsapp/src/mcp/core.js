// Transport-agnostic MCP core.
//
// Wires the low-level SDK `Server` (NOT McpServer — we validate args with yup inside the
// tool handlers, so we don't want McpServer's zod requirement) to the tools + resources
// built in Tasks 4-5. Registers the four request handlers (tools/list, tools/call,
// resources/list, resources/read); every handler that can throw is wrapped so domain and
// unexpected errors map through `toMcpError` ONCE at this boundary — nothing leaks raw.
//
// `ServerClass` is injectable so tests can substitute a fake server (no real transport).
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import { buildTools } from './tools.js';
import { buildResources } from './resources.js';
import { toMcpError } from './errors.js';

export function createMcpCore(ctx, { ServerClass = Server } = {}) {
  const tools = buildTools(ctx);
  const resources = buildResources(ctx);
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const server = new ServerClass(
    { name: 'whatsapp-report', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    // Only the client-facing descriptor fields — never the runtime handler/yupSchema.
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolByName.get(request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
    try {
      const result = await tool.handler(request.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] };
    } catch (err) {
      throw toMcpError(err, { logger: ctx.logger });
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resources.list()
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      const data = await resources.read(uri);
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data ?? null) }]
      };
    } catch (err) {
      throw toMcpError(err, { logger: ctx.logger });
    }
  });

  return {
    server,
    async attachTransport(transport) {
      await server.connect(transport);
    },
    async start() {
      /* transports drive I/O; nothing to start here */
    }
  };
}
