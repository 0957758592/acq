import express from 'express';
import helmet from 'helmet';

import { httpStatusFor, authenticate } from './http-mapping.js';
import { attachEventStream } from './sse.js';
import { correlationMiddleware } from './correlation.js';
import { createRateLimiter } from './rate-limit.js';
import { runGraphql } from './graphql-surface.js';

// REST surface over the single command facade (TZ §11.4). Thin presentation:
// auth + envelope + status mapping only, zero business logic. Every operation
// is POST /v1/op/:operation with a JSON args body; the facade enforces RBAC,
// validation, error mapping and audit.
export function createRestServer({
  facade,
  tokens = {},
  logger = null,
  eventSource = null,
  webhookProcessor = null,
  mcpHandler = null,
  graphqlSchema = null,
  a2a = null,
  rateLimit = { max: 300, windowMs: 60_000 }
} = {}) {
  const app = express();
  app.use(helmet());
  // Capture the raw body so inbound webhooks can verify their HMAC signature.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(correlationMiddleware());

  // Health is unauthenticated (liveness).
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'control-plane' }));

  // A2A (agent-to-agent, TZ §11.3): public agent card for discovery + a
  // bearer-gated task endpoint routing through the facade.
  if (a2a) {
    app.get('/.well-known/agent-card.json', (_req, res) => res.json(a2a.card));
    app.post('/a2a', async (req, res) => {
      if (!authenticate(req.headers.authorization, { tokens })) {
        return res.status(401).json({ status: { state: 'failed' }, error: { code: 'UNAUTHORIZED', message: 'unauthorized' } });
      }
      res.json(await a2a.task(req.body || {}));
    });
  }

  // Inbound webhooks (TZ §11.5) — authenticated by HMAC signature (not bearer),
  // with replay protection + idempotency in the processor.
  if (webhookProcessor) {
    app.post('/webhooks/inbound', async (req, res) => {
      const result = await webhookProcessor.process(req.body || {}, {
        timestamp: req.headers['x-acq-timestamp'],
        signature: req.headers['x-acq-signature'],
        rawBody: req.rawBody
      });
      if (result.ok) return res.json({ data: { accepted: true }, error: null, meta: {} });
      const status = result.reason === 'duplicate' ? 200 : 401;
      return res.status(status).json({ data: null, error: { code: 'WEBHOOK_REJECTED', message: result.reason }, meta: {} });
    });
  }

  // MCP-over-HTTP endpoint (TZ §11.3) — the brain/agent contour served over the
  // network via StreamableHTTP (session-managed in mcpHandler). Bearer-gated;
  // routes JSON-RPC to the generic MCP server (tools = OPERATIONS, resources =
  // acq:// RAG read-models), all through the SAME facade.
  if (mcpHandler) {
    app.all('/mcp', mcpHandler);
  }

  // Bearer auth (fail-closed) for everything under /v1.
  app.use('/v1', (req, res, next) => {
    const auth = authenticate(req.headers.authorization, { tokens });
    if (!auth) {
      return res
        .status(401)
        .json({ data: null, error: { code: 'UNAUTHORIZED', message: 'missing or invalid bearer token' }, meta: {} });
    }
    req.auth = auth;
    next();
  });

  // Rate limiting per authenticated actor (TZ §14.6). Applied after auth so the
  // bucket key is the token/actor, not just the IP.
  if (rateLimit) {
    app.use('/v1', createRateLimiter({ max: rateLimit.max, windowMs: rateLimit.windowMs }));
  }

  // SSE stream of domain events (TZ §11.5) — one-way, auth-gated.
  if (eventSource) {
    app.get('/v1/events', (req, res) => {
      attachEventStream(res, eventSource);
      logger?.info?.('sse open', { role: req.auth.role });
    });
  }

  // GraphQL control surface (TZ §11.4) — one `op(operation, args)` field over the
  // facade; RBAC role comes from the authenticated actor.
  if (graphqlSchema) {
    app.post('/v1/graphql', async (req, res) => {
      const result = await runGraphql(graphqlSchema, {
        query: req.body?.query,
        variables: req.body?.variables ?? {},
        context: { role: req.auth.role, actor: req.auth.actor, correlationId: req.correlationId }
      });
      res.json(result);
    });
  }

  app.post('/v1/op/:operation', async (req, res) => {
    const operation = req.params.operation;
    const correlationId = req.correlationId;
    const envelope = await facade.execute(operation, {
      role: req.auth.role,
      actor: req.auth.actor,
      args: req.body || {},
      correlationId
    });
    logger?.info?.('op', { operation, role: req.auth.role, ok: !envelope.error, correlationId });
    res.status(httpStatusFor(envelope.error?.code)).json(envelope);
  });

  return app;
}
