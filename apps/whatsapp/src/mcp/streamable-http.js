// Streamable-HTTP MCP entrypoint for @acq/whatsapp-app.
//
// Hosts the MCP StreamableHTTPServerTransport inside an Express app. The
// transport does NOT open its own port — we own the HTTP server and forward
// requests into `transport.handleRequest(req, res, req.body)` (POST carries
// client→server JSON-RPC; GET upgrades to the server→client SSE stream).
//
// Security: everything except the health probe sits behind a constant-time
// bearer check that FAILS CLOSED when no token is configured. The core's
// eventBus is bridged to MCP notifications so SSE clients receive domain events.
//
// No I/O runs at import: `createHttpApp`/`startHttp` only build/listen when
// called. Tests exercise the auth middleware in isolation with fakes.
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getAuthTokenFromRequest } from '@acq/core/utils/auth';
import { buildContext } from '../composition.js';
import { env } from '../config/env.js';
import { createMcpCore } from './core.js';
import { bridgeNotifications } from './notifications.js';

// Constant-time comparison. Hashing both sides to a fixed-length sha256 digest
// keeps `timingSafeEqual` from throwing on length mismatch AND avoids leaking
// the expected token's length through timing.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function bearerAuth(expectedToken) {
  return (req, res, next) => {
    const token = getAuthTokenFromRequest(req);
    // Fail closed: reject if no token is configured, none presented, or mismatch.
    if (!expectedToken || !token || !safeEqual(token, expectedToken)) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'unauthorized' });
    }
    return next();
  };
}

export async function createHttpApp(
  ctx,
  {
    expectedToken,
    TransportClass = StreamableHTTPServerTransport,
    createCore = createMcpCore,
    bridge = bridgeNotifications,
    sessionId = () => crypto.randomUUID()
  } = {}
) {
  const app = express();
  app.disable('x-powered-by');
  // Secure HTTP headers on EVERY response (REQUIREM §4.6/§7.5). Mounted first so
  // even the unauthenticated /health probe carries the hardened header set.
  app.use(helmet());
  app.use(express.json());

  // Unauthenticated liveness probe — safe to expose, reveals nothing.
  app.get('/health', (req, res) => res.json({ ok: true }));

  // Everything below requires a valid bearer token.
  app.use(bearerAuth(expectedToken));

  const core = createCore(ctx);
  bridge({ eventBus: ctx.eventBus, server: core.server, logger: ctx.logger });
  const transport = new TransportClass({ sessionIdGenerator: sessionId });
  await core.attachTransport(transport);

  app.all('/mcp', async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      ctx.logger?.error?.('mcp http request failed', { error: err.message });
      if (!res.headersSent) {
        res.status(500).json({ code: 'INTERNAL', message: 'Internal error' });
      }
    }
  });

  return app;
}

export async function startHttp({ port = env.mcpHttpPort, expectedToken = env.mcpAuthToken } = {}) {
  const ctx = buildContext({ env });
  const app = await createHttpApp(ctx, { expectedToken });
  return app.listen(port, () => ctx.logger?.info?.('[whatsapp-mcp-http] listening', { port }));
}

// Guarded direct-run entrypoint: only runs when executed directly, not on import.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startHttp().catch((err) => {
    process.stderr.write(`mcp-http failed to start: ${err.message}\n`);
    process.exit(1);
  });
}
