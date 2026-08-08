// worker.js — process entrypoint for @acq/scrape-worker-app (TZ §2.3/§10.3).
// Consumes engine.scrape jobs, routes them through the hybrid ScrapeProvider and
// idempotently persists normalized read-models. No I/O at import.
import http from 'node:http';

import { createScrapeProvider } from '@acq/scraping';

import { consumeJsonWithDlq, createMongoScrapeResultRepo, createMongoProxyRepo, createMongoTelemetryRepo, createMongoTargetRepo } from '@acq/engine-infra';
import { EngineTelemetry } from '@acq/core/models/engine-telemetry';
import { EngineTarget } from '@acq/core/models/engine-target';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { connectRabbitmq, disconnectRabbitmq, consumeJson, publishJson } from '@acq/core/queue/rabbitmq';
import { getRedis, disconnectRedis } from '@acq/core/db/redis';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';
import { EngineProxy } from '@acq/core/models/engine-proxy';
import { createStructuredLogger } from '@acq/logger';

import { scrapeTaskHandler } from './scrape-handler.js';
import { buildScrapeAdapters } from './composition.js';
import { buildMtprotoClientFromEnv } from './mtproto-client.js';

// Lazily load the real GramJS binding and build the MTProto user-session client
// only when a session is configured — GramJS pulls a heavy socket stack we don't
// want at import when the mtproto tier is unused. A resolved `env:`/vault secret
// carries the session string (never hardcoded). Absent config -> null (tier off).
async function resolveMtprotoClient({ env, secretResolver }) {
  const sessionString = await secretResolver.resolve(env.mtprotoSession);
  const apiHash = await secretResolver.resolve(env.mtprotoApiHash);
  if (!sessionString || !env.mtprotoApiId || !apiHash) return null;
  const [{ TelegramClient }, { StringSession }] = await Promise.all([
    import('telegram'),
    import('telegram/sessions/index.js')
  ]);
  return buildMtprotoClientFromEnv({ apiId: Number(env.mtprotoApiId), apiHash, sessionString, gramjs: { TelegramClient, StringSession } });
}

const QUEUE = 'engine.scrape';

// Env-backed secret resolver for proxy endpoints: an `env:NAME` ref reads
// process.env[NAME]; a JSON value is returned as the endpoint object (host/port/
// user/pass), otherwise the raw string. A real vault/KMS adapter plugs in via deps.
function createEnvSecretResolver() {
  return {
    async resolve(ref) {
      if (typeof ref !== 'string' || !ref.startsWith('env:')) return ref;
      const value = process.env[ref.slice(4)];
      if (value == null) return null;
      try { return JSON.parse(value); } catch { return value; }
    }
  };
}

// Liveness endpoint (TZ §13/§16) — every process exposes /health.
export function startHealthServer(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'scrape-worker' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// Minimal event bus: mirror each domain event to a durable Rabbit queue and a
// Redis pub/sub channel (TZ §3.9). Injectable so tests substitute a fake.
function makeEventBus(redis) {
  return {
    async publish(event) {
      await publishJson('engine.events', event);
      await redis.publish('acq:events', JSON.stringify(event));
    }
  };
}

export async function main({ env, deps = {} } = {}) {
  await connectMongo(env.mongoUri);
  await connectRabbitmq(env.rabbitUrl);
  const redis = getRedis(env.redisUrl);
  const logger = createStructuredLogger({ level: env.logLevel || 'info', base: { service: 'scrape-worker' } });

  const secretResolver = deps.secretResolver ?? createEnvSecretResolver();

  // MTProto (Telegram full-history/roster) tier — wired from a configured user
  // session (api_id/api_hash + Telethon session string). Tests still override
  // via deps.mtprotoClient; the running worker resolves it from vaulted env.
  const mtprotoClient = deps.mtprotoClient ?? (await resolveMtprotoClient({ env, secretResolver }));

  // Real hybrid tiers by default (browser primary via Puppeteer + optional
  // http/device), assembled by the composition. deps.scrapeAdapters still
  // overrides for tests. Per-platform selectors are the verify-by-fact seam.
  const wired = deps.scrapeAdapters
    ? { adapters: deps.scrapeAdapters, browserProvider: null }
    : buildScrapeAdapters({
        browserSelectors: deps.browserSelectors,
        httpSelectors: deps.httpSelectors,
        deviceScrape: deps.deviceScrape,
        apiEndpoints: deps.apiEndpoints,
        telegramBotToken: env.telegramBotToken,
        mtprotoClient,
        maxConcurrency: env.browserConcurrency
      });

  const ctx = {
    clock: { now: () => new Date() },
    logger,
    scrapeProvider: createScrapeProvider({ adapters: wired.adapters }),
    scrapeResultRepo: createMongoScrapeResultRepo({ model: EngineScrapeResult }),
    // Parser telemetry sink (§10/§15) — every scrape records what it produced.
    telemetryRepo: deps.telemetryRepo ?? createMongoTelemetryRepo({ model: EngineTelemetry }),
    // Callable targets DB sink (§3.5/§10.5) — discovered actors become targets.
    targetRepo: deps.targetRepo ?? createMongoTargetRepo({ model: EngineTarget }),
    // Proxy pool + secret resolution so a scrape can auto-pick a residential
    // proxy (`params.useResidential`). Endpoints are vaulted (env: refs may hold a
    // JSON endpoint object); absent one, the pick fails safe with a coded seam.
    proxyRepo: deps.proxyRepo ?? createMongoProxyRepo({ model: EngineProxy }),
    secretResolver,
    eventBus: deps.eventBus ?? makeEventBus(redis)
  };

  consumeJsonWithDlq(QUEUE, (job) => scrapeTaskHandler(ctx, job?.payload ?? job), {
    consumeJson,
    publishJson,
    clock: ctx.clock,
    logger,
    // Scrape is a one-shot request (no reconciler re-emit) — capture a transient
    // failure in the DLQ instead of dropping it (§10).
    deadLetterTransient: true
  });
  const server = await startHealthServer(env.healthPort || 7700);
  logger.info?.('scrape-worker up', { queue: QUEUE, healthPort: env.healthPort || 7700 });

  const shutdown = async () => {
    server.close();
    if (wired.browserProvider) await wired.browserProvider.close();
    await disconnectRabbitmq();
    await disconnectRedis();
    await disconnectMongo();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return { ctx, server, shutdown };
}

if (process.argv[1] && process.argv[1].endsWith('worker.js')) {
  main({
    env: {
      mongoUri: process.env.MONGODB_URI,
      rabbitUrl: process.env.RABBITMQ_URL,
      redisUrl: process.env.REDIS_URL,
      healthPort: Number(process.env.SCRAPE_HEALTH_PORT || 7700),
      // Opt-in Telegram Bot API tier — absent by default (web scraper remains primary).
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
      // Opt-in MTProto tier (full history + roster) — a vaulted user session.
      // The session string is a secret ref (env:/vault), never a literal here.
      mtprotoApiId: process.env.TELEGRAM_MTPROTO_API_ID || null,
      mtprotoApiHash: process.env.TELEGRAM_MTPROTO_API_HASH || null,
      mtprotoSession: process.env.TELEGRAM_MTPROTO_SESSION || null
    }
  }).catch((err) => {
    console.error('scrape-worker failed to start', err);
    process.exit(1);
  });
}
