import express from 'express';
import helmet from 'helmet';

import { httpStatusFor, authenticate } from './http-mapping.js';

// REST surface over the single command facade (TZ §11.4). Thin presentation:
// auth + envelope + status mapping only, zero business logic. Every operation
// is POST /v1/op/:operation with a JSON args body; the facade enforces RBAC,
// validation, error mapping and audit.
export function createRestServer({ facade, tokens = {}, logger = null } = {}) {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  // Health is unauthenticated (liveness).
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'control-plane' }));

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

  app.post('/v1/op/:operation', async (req, res) => {
    const operation = req.params.operation;
    const correlationId = req.headers['x-correlation-id'] || null;
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
