// worker.js — process entrypoint for @acq/scrape-worker-app (TZ §2.3/§10.3).
// Consumes engine.scrape jobs, routes them through the hybrid ScrapeProvider and
// idempotently persists normalized read-models. No I/O at import.
import http from 'node:http';

import { createScrapeProvider } from '@acq/scraping';

import { consumeJsonWithDlq, createMongoScrapeResultRepo } from '@acq/engine-infra';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { connectRabbitmq, disconnectRabbitmq, consumeJson, publishJson } from '@acq/core/queue/rabbitmq';
import { getRedis, disconnectRedis } from '@acq/core/db/redis';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';
import { createStructuredLogger } from '@acq/logger';

import { scrapeTaskHandler } from './scrape-handler.js';
import { buildScrapeAdapters } from './composition.js';

const QUEUE = 'engine.scrape';

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

  // Real hybrid tiers by default (browser primary via Puppeteer + optional
  // http/device), assembled by the composition. deps.scrapeAdapters still
  // overrides for tests. Per-platform selectors are the verify-by-fact seam.
  const wired = deps.scrapeAdapters
    ? { adapters: deps.scrapeAdapters, browserProvider: null }
    : buildScrapeAdapters({
        browserSelectors: deps.browserSelectors,
        httpSelectors: deps.httpSelectors,
        deviceScrape: deps.deviceScrape,
        maxConcurrency: env.browserConcurrency
      });

  const ctx = {
    clock: { now: () => new Date() },
    logger,
    scrapeProvider: createScrapeProvider({ adapters: wired.adapters }),
    scrapeResultRepo: createMongoScrapeResultRepo({ model: EngineScrapeResult }),
    eventBus: deps.eventBus ?? makeEventBus(redis)
  };

  consumeJsonWithDlq(QUEUE, (job) => scrapeTaskHandler(ctx, job?.payload ?? job), {
    consumeJson,
    publishJson,
    clock: ctx.clock,
    logger
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
      healthPort: Number(process.env.SCRAPE_HEALTH_PORT || 7700)
    }
  }).catch((err) => {
    console.error('scrape-worker failed to start', err);
    process.exit(1);
  });
}
