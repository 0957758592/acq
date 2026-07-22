import express from 'express';
import helmet from 'helmet';

import { httpStatusFor, authenticate } from './http-mapping.js';
import { attachEventStream } from './sse.js';
import { correlationMiddleware } from './correlation.js';

// REST surface over the single command facade (TZ §11.4). Thin presentation:
// auth + envelope + status mapping only, zero business logic. Every operation
// is POST /v1/op/:operation with a JSON args body; the facade enforces RBAC,
// validation, error mapping and audit.
export function createRestServer({ facade, tokens = {}, logger = null, eventSource = null, webhookProcessor = null } = {}) {
  const app = express();
  app.use(helmet());
  // Capture the raw body so inbound webhooks can verify their HMAC signature.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(correlationMiddleware());

  // Health is unauthenticated (liveness).
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'control-plane' }));

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

  // SSE stream of domain events (TZ §11.5) — one-way, auth-gated.
  if (eventSource) {
    app.get('/v1/events', (req, res) => {
      attachEventStream(res, eventSource);
      logger?.info?.('sse open', { role: req.auth.role });
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
