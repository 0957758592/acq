import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

// Session-managed MCP-over-HTTP handler (TZ §11.3). Each client `initialize`
// mints a fresh transport + a fresh MCP server (createServer()), keyed by the
// SDK's mcp-session-id header; later requests route to that session; close
// evicts it. Bearer-gated (fail-closed) with JSON-RPC-shaped errors. This is the
// standard StreamableHTTP multi-session pattern — a single shared transport
// would reject a second client with "Server already initialized".
export function createMcpHttpHandler({ createServer, authenticate, tokens = {}, logger = null } = {}) {
  const transports = {};

  return async function mcpHandler(req, res, next) {
    if (!authenticate(req.headers.authorization, { tokens })) {
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null });
    }
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport = sessionId ? transports[sessionId] : null;

      if (!transport) {
        if (sessionId || !isInitializeRequest(req.body)) {
          return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid session ID' }, id: null });
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => { transports[id] = transport; }
        });
        transport.onclose = () => { if (transport.sessionId) delete transports[transport.sessionId]; };
        const mcp = createServer();
        await mcp.attachTransport(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger?.error?.('mcp http request failed', { error: err.message });
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null });
      } else {
        next(err);
      }
    }
  };
}
