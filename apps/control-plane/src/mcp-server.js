// Generic MCP server (TZ §11.3) — the brain/agent contour over the SINGLE command
// facade. Uses the low-level SDK `Server` (args validated in the facade, not zod).
// tools/list + tools/call are generated from the OPERATIONS catalog and routed
// through facade.execute (RBAC + injection guard + audit + envelope). resources
// expose the read-only `acq://…` RAG read-models. Transport-agnostic:
// attachTransport(stdio | streamable-http | in-memory) drives I/O.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';

import { buildMcpToolDefs } from './mcp-tools.js';
import { buildRagResources } from './rag-resources.js';

export function createAcqMcpServer({ facade, ctx, role = 'brain', actor = 'mcp', ServerClass = Server } = {}) {
  const resources = buildRagResources(ctx);
  const server = new ServerClass({ name: 'acq', version: '0.1.0' }, { capabilities: { tools: {}, resources: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: buildMcpToolDefs() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const envelope = await facade.execute(request.params.name, {
      role,
      actor,
      args: request.params.arguments ?? {},
      correlationId: request.params._meta?.correlationId
    });
    if (envelope.error) {
      return { content: [{ type: 'text', text: JSON.stringify(envelope.error) }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(envelope.data ?? null) }] };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: resources.list() }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      const data = await resources.read(uri);
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data ?? null) }] };
    } catch (err) {
      throw new McpError(ErrorCode.InvalidParams, err.message);
    }
  });

  return {
    server,
    attachTransport: (transport) => server.connect(transport)
  };
}
