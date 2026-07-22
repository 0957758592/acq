// worker.js — process entrypoint for @acq/scrape-worker-app (TZ §2.3/§10.3).
// Consumes engine.scrape jobs, routes them through the hybrid ScrapeProvider and
// idempotently persists normalized read-models. No I/O at import.
import { createScrapeProvider } from '@acq/scraping';

import { consumeJsonWithDlq, createMongoScrapeResultRepo } from '@acq/engine-infra';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { connectRabbitmq, disconnectRabbitmq, consumeJson, publishJson } from '@acq/core/queue/rabbitmq';
import { getRedis, disconnectRedis } from '@acq/core/db/redis';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';
import { createStructuredLogger } from '@acq/logger';

import { scrapeTaskHandler } from './scrape-handler.js';

const QUEUE = 'engine.scrape';

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

  const ctx = {
    clock: { now: () => new Date() },
    logger,
    // Tier adapters are injected by config; without them, scrape() surfaces a
    // coded SCRAPE_TIER_UNAVAILABLE (verify-by-fact — no blind guessing).
    scrapeProvider: createScrapeProvider({ adapters: deps.scrapeAdapters ?? {} }),
    scrapeResultRepo: createMongoScrapeResultRepo({ model: EngineScrapeResult }),
    eventBus: deps.eventBus ?? makeEventBus(redis)
  };

  consumeJsonWithDlq(QUEUE, (job) => scrapeTaskHandler(ctx, job?.payload ?? job), {
    consumeJson,
    publishJson,
    clock: ctx.clock,
    logger
  });
  logger.info?.('scrape-worker up', { queue: QUEUE });

  const shutdown = async () => {
    await disconnectRabbitmq();
    await disconnectRedis();
    await disconnectMongo();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return { ctx, shutdown };
}

if (process.argv[1] && process.argv[1].endsWith('worker.js')) {
  main({
    env: {
      mongoUri: process.env.MONGODB_URI,
      rabbitUrl: process.env.RABBITMQ_URL,
      redisUrl: process.env.REDIS_URL
    }
  }).catch((err) => {
    console.error('scrape-worker failed to start', err);
    process.exit(1);
  });
}
