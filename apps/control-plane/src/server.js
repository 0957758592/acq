// server.js — process entrypoint for @acq/control-plane-app (TZ §11).
// Connects Mongo, builds the engine ctx + use-cases, wraps them in the single
// command facade, and serves the REST surface. No I/O at import; main() runs
// on direct execution or when a test calls it with injected env.
import { createFacade } from '@acq/control';
import { createMongoAuditLog } from '@acq/engine-infra';

import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { getRedis, disconnectRedis } from '@acq/core/db/redis';
import { EngineAuditLog } from '@acq/core/models/engine-audit-log';
import { createStructuredLogger } from '@acq/logger';

import { buildEngineContext } from '../../engine/src/composition.js';
import { buildUseCases } from './use-cases.js';
import { createRestServer } from './rest-server.js';
import { createRedisEventSource } from './redis-event-source.js';
import { createWebhookProcessor } from './webhooks.js';

export async function main({ env } = {}) {
  await connectMongo(env.mongoUri);
  const logger = createStructuredLogger({ level: env.logLevel || 'info', base: { service: 'control-plane' } });
  const ctx = buildEngineContext({ env: { platforms: env.platforms } });
  const useCases = buildUseCases(ctx);
  // Immutable audit trail for every mutating command (TZ §14.7).
  const audit = env.audit ?? createMongoAuditLog({ model: EngineAuditLog });
  const facade = createFacade({ useCases, audit });

  // SSE event source (Redis pub/sub) — one-way stream of domain events (§11.5).
  const eventSource = env.redisUrl
    ? createRedisEventSource({ subscriber: getRedis(env.redisUrl).duplicate() })
    : null;
  // Inbound webhooks (HMAC + replay + idempotency) — only when a secret is set.
  // seenStore is in-process; back it with Redis for cross-instance dedup.
  const seen = new Set();
  const webhookProcessor = env.webhookSecret
    ? createWebhookProcessor({
        facade,
        secret: env.webhookSecret,
        clock: { now: () => new Date() },
        seenStore: { has: (id) => seen.has(id), add: (id) => seen.add(id) },
        role: 'brain'
      })
    : null;

  const app = createRestServer({ facade, tokens: env.tokens, logger, eventSource, webhookProcessor });

  const server = await new Promise((resolve) => {
    const s = app.listen(env.port, () => resolve(s));
  });
  logger.info?.('control-plane up', { port: env.port });

  const shutdown = async () => {
    server.close();
    if (env.redisUrl) await disconnectRedis();
    await disconnectMongo();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return { server, shutdown, facade };
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const tokens = {};
  if (process.env.CONTROL_ADMIN_TOKEN) tokens[process.env.CONTROL_ADMIN_TOKEN] = 'admin';
  if (process.env.CONTROL_READONLY_TOKEN) tokens[process.env.CONTROL_READONLY_TOKEN] = 'readonly';
  main({
    env: {
      mongoUri: process.env.MONGODB_URI,
      redisUrl: process.env.REDIS_URL,
      webhookSecret: process.env.WEBHOOK_SECRET,
      port: Number(process.env.CONTROL_PORT || 7500),
      tokens
    }
  }).catch((err) => {
    console.error('control-plane failed to start', err);
    process.exit(1);
  });
}
