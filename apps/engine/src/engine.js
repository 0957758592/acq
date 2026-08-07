// engine.js — process entrypoint for @acq/engine-app (TZ §2.3/§8.5).
//
// Connects infra, builds the composition-root ctx, starts a health server, and
// schedules the reconciler tick per active platform (node-cron in the
// composition root, never in the domain). No I/O runs at import: main() only
// executes on direct run. reconcileTick / startHealthServer are testable with
// injected fakes.
import http from 'node:http';

import cron from 'node-cron';

import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { getRedis, disconnectRedis } from '@acq/core/db/redis';
import { connectRabbitmq, disconnectRabbitmq } from '@acq/core/queue/rabbitmq';
import { createMetricsRegistry } from '@acq/core/observability/metrics';
import { createDomainMetrics } from '@acq/core/observability/domain-metrics';

import { buildEngineContext } from './composition.js';
import { planForPlatform } from './snapshot.js';
import { dispatchIntents } from './intents.js';
import { createRabbitJobDispatcher } from './rabbit-dispatcher.js';
import { registerConsumers } from './consumers.js';

// One reconcile pass across every active platform. Pure-ish: only the repo reads
// and the (optional) dispatch touch I/O. Returns the intents it planned.
export async function reconcileTick(ctx, { planFn = planForPlatform, dispatchFn = dispatchIntents } = {}) {
  const all = [];
  for (const platform of ctx.activePlatforms) {
    let intents = [];
    try {
      intents = await planFn(ctx, { platform });
    } catch (err) {
      ctx.logger.error?.('reconcile failed', { platform, err: err.message });
      continue;
    }
    if (ctx.jobDispatcher) {
      await dispatchFn(intents, { jobDispatcher: ctx.jobDispatcher, clock: ctx.clock }).catch(() => {});
    }
    ctx.metrics?.reconcileTicks?.inc({ platform });
    ctx.metrics?.intentsDispatched?.inc({ platform }, intents.length);
    ctx.logger.info?.('reconcile tick', { platform, intents: intents.length });
    all.push(...intents);
  }
  return all;
}

export function startHealthServer(port, { onHealth, onMetrics } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const body = JSON.stringify(onHealth ? onHealth() : { status: 'ok' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    if (req.url === '/metrics' && onMetrics) {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      res.end(onMetrics());
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

export async function main({ env } = {}) {
  await connectMongo(env.mongoUri);
  getRedis(env.redisUrl);
  await connectRabbitmq(env.rabbitUrl);

  const ctx = buildEngineContext({
    env: {
      platforms: env.platforms,
      poolThreshold: env.poolThreshold,
      buyBatchSize: env.buyBatchSize,
      autobuyEnabled: env.autobuyEnabled,
      // Reseller vendor + vault + FX so the AUTONOMOUS acquire job can actually buy
      // and import (keystore driver). Whether it buys is still gated by autobuyEnabled.
      darkShoppingApiKey: env.darkShoppingApiKey,
      darkShoppingBaseUrl: env.darkShoppingBaseUrl,
      rubPerUsd: env.rubPerUsd,
      secretVaultKey: env.secretVaultKey,
      buyStrategy: env.buyStrategy,
      buyMinRating: env.buyMinRating,
      buyMaxUnitPriceRub: env.buyMaxUnitPriceRub,
      buyCountry: env.buyCountry,
      // Cloud-phone device provider (DuoPlus) so bring-online/probe/action run on a
      // real device; absent -> those handlers fail-safe (no device, no guessing).
      deviceProvider: env.deviceProvider,
      proxyMode: env.proxyMode,
      pid: process.pid
    },
    deps: { jobDispatcher: createRabbitJobDispatcher() }
  });

  // Observability: metrics registry exposed at /metrics (TZ §15).
  const registry = createMetricsRegistry();
  ctx.metrics = {
    reconcileTicks: registry.counter('acq_engine_reconcile_ticks_total', 'Reconcile ticks per platform'),
    intentsDispatched: registry.counter('acq_engine_intents_dispatched_total', 'Intents dispatched per platform')
  };
  // Domain signals (TZ §15): pool depth, device occupancy/saturation, queue
  // depth, ban share, purchase spend, captchas — same registry, one /metrics.
  ctx.domainMetrics = createDomainMetrics(registry);

  // Register job consumers (DLQ-wrapped) so dispatched work is processed.
  registerConsumers(ctx);

  const server = await startHealthServer(env.healthPort, {
    onHealth: () => ({ status: 'ok', service: 'engine', platforms: ctx.activePlatforms }),
    onMetrics: () => registry.render()
  });
  ctx.logger.info?.('engine up', { port: env.healthPort, platforms: ctx.activePlatforms });

  const task = cron.schedule(env.reconcileCron || '*/5 * * * *', () => {
    reconcileTick(ctx).catch((err) => ctx.logger.error?.('tick error', { err: err.message }));
  });

  const shutdown = async () => {
    task.stop();
    server.close();
    await disconnectRabbitmq();
    await disconnectRedis();
    await disconnectMongo();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { ctx, server, task, shutdown };
}

// Direct-run guard.
if (process.argv[1] && process.argv[1].endsWith('engine.js')) {
  main({
    env: {
      mongoUri: process.env.MONGODB_URI,
      redisUrl: process.env.REDIS_URL,
      rabbitUrl: process.env.RABBITMQ_URL,
      healthPort: Number(process.env.ENGINE_HEALTH_PORT || 7401),
      reconcileCron: process.env.ENGINE_RECONCILE_CRON,
      poolThreshold: Number(process.env.ENGINE_POOL_THRESHOLD || 10),
      buyBatchSize: Number(process.env.ENGINE_BUY_BATCH_SIZE || 5),
      autobuyEnabled: process.env.ENGINE_AUTOBUY_ENABLED === 'true',
      darkShoppingApiKey: process.env.DARKSHOP_API_KEY || process.env.DARK_SHOPPING_API_KEY || undefined,
      darkShoppingBaseUrl: process.env.DARKSHOP_BASE_URL || process.env.DARK_SHOPPING_BASE_URL || undefined,
      rubPerUsd: process.env.RUB_PER_USD ? Number(process.env.RUB_PER_USD) : undefined,
      secretVaultKey: process.env.SECRET_VAULT_KEY || undefined,
      buyStrategy: process.env.BUY_STRATEGY || undefined,
      buyMinRating: process.env.BUY_MIN_RATING ? Number(process.env.BUY_MIN_RATING) : undefined,
      buyMaxUnitPriceRub: process.env.BUY_MAX_UNIT_PRICE_RUB ? Number(process.env.BUY_MAX_UNIT_PRICE_RUB) : undefined,
      buyCountry: process.env.BUY_COUNTRY || undefined,
      proxyMode: process.env.PROXY_MODE || undefined,
      deviceProvider: process.env.DUOPLUS_API_KEY
        ? { type: 'duoplus', apiKey: process.env.DUOPLUS_API_KEY, baseUrl: process.env.DUOPLUS_API_BASE_URL || undefined }
        : undefined
    }
  }).catch((err) => {
    console.error('engine failed to start', err);
    process.exit(1);
  });
}
