// orchestrator.js — process entrypoint for @acq/whatsapp-app.
//
// Wires the whole app together: connects infra, builds the composition-root
// `ctx`, schedules the reconciler tick (node-cron — our own, NOT the engine's
// startCron), subscribes to key events for event-driven speed, registers the
// six queue consumers (each wrapped with the DLQ ledger + per-job correlationId),
// and installs graceful-shutdown handlers.
//
// No I/O runs at import: `main()` only executes on direct-run or when a test
// calls it with fakes. The exported `reconcileTick` / `HANDLERS` /
// `registerConsumers` pieces are individually testable with injected fakes.
import http from 'node:http';

import cron from 'node-cron';

import { reconcile } from '@acq/whatsapp';
import { consumeJsonWithDlq } from '@acq/whatsapp-infra';
import { releaseLeasesByOwner } from '@acq/shared';

import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { getRedis, disconnectRedis } from '@acq/core/db/redis';
import {
  connectRabbitmq,
  disconnectRabbitmq,
  consumeJson,
  publishJson
} from '@acq/core/queue/rabbitmq';
import { EngineDevice } from '@acq/core/models/engine-device';
import { EngineJobRun } from '@acq/core/models/engine-job-run';

import { env } from './config/env.js';
import { buildContext } from './composition.js';
import { buildSnapshot } from './snapshot.js';
import { dispatchIntents } from './intents.js';
import { runJob } from './run-job.js';
import { buyAccountsHandler } from './handlers/buy-accounts.handler.js';
import { fillQueueHandler } from './handlers/fill-queue.handler.js';
import { bringOnlineHandler } from './handlers/bring-online.handler.js';
import { probeHealthHandler } from './handlers/probe-health.handler.js';
import { replaceBannedHandler } from './handlers/replace-banned.handler.js';
import { runReportTaskHandler } from './handlers/run-report-task.handler.js';

// 1) The reconciler tick — pure-ish, testable with a fake ctx.
export async function reconcileTick(
  ctx,
  { buildSnapshotFn = buildSnapshot, reconcileFn = reconcile, dispatchIntentsFn = dispatchIntents } = {}
) {
  const snapshot = await buildSnapshotFn(ctx);
  const intents = reconcileFn(snapshot);
  await dispatchIntentsFn(intents, { jobDispatcher: ctx.jobDispatcher, clock: ctx.clock });
  return intents;
}

// 2) The queue -> handler table.
export const HANDLERS = [
  { queue: 'whatsapp.buy', handler: buyAccountsHandler },
  { queue: 'whatsapp.queue-fill', handler: fillQueueHandler },
  { queue: 'whatsapp.bring-online', handler: bringOnlineHandler },
  { queue: 'whatsapp.probe', handler: probeHealthHandler },
  { queue: 'whatsapp.replace', handler: replaceBannedHandler },
  { queue: 'whatsapp.report', handler: runReportTaskHandler }
];

// The queues this process owns — used to scope the retry-republish sweep.
export const WHATSAPP_QUEUES = HANDLERS.map((h) => h.queue);

// Retry-republish sweep: this process's consumers nack-drop transient failures
// (the broker message is gone), and `runJob` leaves the EngineJobRun as
// `status:'queued'` with a due `nextRetryAt`. The engine's own retry cron does
// NOT run here, so nothing would re-deliver. This function re-publishes every
// due, queued job run for our queues back onto its queue. Testable with fakes.
export async function republishRetries(ctx, { publish = publishJson, model = EngineJobRun } = {}) {
  const now = ctx.clock.now();
  const due = await model
    .find({
      queueName: { $in: WHATSAPP_QUEUES },
      status: 'queued',
      nextRetryAt: { $ne: null, $lte: now }
    })
    .lean();
  for (const jr of due) {
    await publish(jr.queueName, {
      jobRunId: String(jr._id),
      jobName: jr.jobName,
      targetType: jr.targetType,
      targetId: jr.targetId,
      payload: jr.payload
    });
  }
  return due.length;
}

// Design Flow D: schedule health probes for online/cooldown accounts (proactive ban detection).
export async function scheduleProbes(ctx) {
  const accounts = await ctx.accountRepo.find({ status: { $in: ['online', 'cooldown'] } });
  const bucket = ctx.clock.now().toISOString().slice(0, 13); // hourly
  let dispatched = 0;
  for (const a of accounts) {
    const accountId = String(a._id ?? a.id);
    const deviceId = a.assignedDeviceId != null ? String(a.assignedDeviceId) : null;
    if (!deviceId) continue; // can't probe an unassigned account
    await ctx.jobDispatcher.dispatch(
      'whatsapp.probe',
      { jobName: 'probe-health', payload: { accountId, deviceId } },
      { idempotencyKey: `probe:${accountId}:${bucket}` }
    );
    dispatched += 1;
  }
  return dispatched;
}

// 3) Register consumers — testable with injected fakes.
export async function registerConsumers(
  ctx,
  {
    consumeWithDlq = consumeJsonWithDlq,
    consume = consumeJson,
    publish = publishJson,
    run = runJob,
    prefetch = 1,
    maxAttempts = 3
  } = {}
) {
  for (const { queue, handler } of HANDLERS) {
    // The broker message is the full dispatch envelope
    // `{ jobRunId, jobName, targetType, targetId, payload }`. `runJob` needs the
    // whole message (it reads `message.jobRunId`), but handlers read domain
    // fields at the top level — those live under `message.payload`. Pass the full
    // message to `run` and the unwrapped domain payload to the handler.
    const wrapped = (message) =>
      run(
        message,
        (p, jobRun) =>
          handler(p.payload ?? {}, {
            ...ctx,
            logger:
              ctx.logger?.child?.({ correlationId: String(jobRun?._id ?? '') }) ?? ctx.logger
          }),
        { clock: ctx.clock }
      );
    await consumeWithDlq(queue, wrapped, {
      consumeJson: consume,
      publishJson: publish,
      clock: ctx.clock,
      logger: ctx.logger,
      prefetch,
      maxAttempts
    });
  }
}

// 4) Liveness/health handler (REQUIREM §16). Pure request/response function so a
// deploy platform can liveness-probe this worker, which otherwise exposes no HTTP
// surface (the MCP-HTTP process runs separately). GET /health -> 200 JSON; else 404.
export function healthHandler(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'whatsapp' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
}

// 5) main() lifecycle — mirrors apps/worker/src/index.js.
export async function main(overrides = {}) {
  const e = overrides.env ?? env;
  if (!e.mongodbUri) throw new Error('Missing MONGODB_URI');
  if (!e.redisUrl) throw new Error('Missing REDIS_URL');
  if (!e.rabbitmqUrl) throw new Error('Missing RABBITMQ_URL');

  await connectMongo(e.mongodbUri);
  getRedis(e.redisUrl);
  await connectRabbitmq(e.rabbitmqUrl);

  const ctx = (overrides.buildContext ?? buildContext)({ env: e });

  // Reconciler cron (node-cron; our own schedule, NOT the engine's startCron).
  const task = cron.schedule(e.probeCron, () => {
    reconcileTick(ctx).catch((err) =>
      ctx.logger?.error?.('reconcile tick failed', { error: err.message })
    );
  });

  // Probe-scheduling cron (Design Flow D): proactively probe online/cooldown
  // accounts so bans are caught before a job hits them, not only reactively.
  const probeTask = cron.schedule(e.probeCron, () => {
    scheduleProbes(ctx).catch((err) =>
      ctx.logger?.error?.('probe scheduling failed', { error: err.message })
    );
  });

  // Retry-republish cron (every minute, like the engine's job-retry cron): our
  // consumers nack-drop transient failures, so re-deliver due queued job runs.
  const retryTask = cron.schedule('* * * * *', () => {
    republishRetries(ctx).catch((err) =>
      ctx.logger?.error?.('retry republish failed', { error: err.message })
    );
  });

  // Event-driven speed: react immediately to key events instead of waiting for
  // the next cron tick.
  for (const type of ['account.banned', 'queue.low', 'pool.low']) {
    ctx.eventBus.subscribe(type, () => {
      reconcileTick(ctx).catch((err) =>
        ctx.logger?.error?.('event reconcile failed', { error: err.message })
      );
    });
  }

  await registerConsumers(ctx);

  // Liveness surface so the deploy platform can health-probe this worker.
  const healthServer = http
    .createServer(healthHandler)
    .listen(e.healthPort ?? 7301, () => ctx.logger?.info?.('[whatsapp] health on', { port: e.healthPort }));

  ctx.logger?.info?.('[whatsapp] running');

  async function shutdown(signal) {
    ctx.logger?.info?.('[whatsapp] shutting down', { signal });
    task.stop();
    probeTask.stop();
    retryTask.stop();
    healthServer.close();
    try {
      await releaseLeasesByOwner(EngineDevice, { owner: ctx.owner });
    } catch {
      /* best-effort */
    }
    await disconnectRabbitmq();
    await disconnectRedis();
    await disconnectMongo();
  }

  process.on('SIGINT', () => shutdown('SIGINT').then(() => process.exit(0)));
  process.on('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)));

  return { ctx, task, probeTask, retryTask, healthServer };
}

// Guarded direct-run entrypoint: only run when executed directly, not when
// imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('whatsapp-app failed to start', err);
    process.exit(1);
  });
}
