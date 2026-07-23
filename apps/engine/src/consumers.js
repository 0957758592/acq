import { consumeJsonWithDlq } from '@acq/engine-infra';
import { consumeJson as coreConsumeJson, publishJson as corePublishJson } from '@acq/core/queue/rabbitmq';

import { runActionTaskHandler } from './handlers/run-action-task.handler.js';
import { fillQueueHandler } from './handlers/fill-queue.handler.js';
import { bringOnlineHandler } from './handlers/bring-online.handler.js';
import { probeHealthHandler } from './handlers/probe-health.handler.js';
import { replaceBannedHandler } from './handlers/replace-banned.handler.js';
import { acquireHandler } from './handlers/acquire.handler.js';
import { warmupHandler } from './handlers/warmup.handler.js';
import { assignProxyHandler } from './handlers/assign-proxy.handler.js';

// Queue -> handler map for the engine's job consumers (TZ §8.3). Generic across
// ALL platforms (not whatsapp-only) — bring-online/probe/replace/action drive
// any platform via ctx.automationFor(platform). acquire/generate/proxy/scrape
// land as their vendor adapters are configured.
export const ENGINE_HANDLERS = {
  'engine.acquire': acquireHandler,
  // Generate reuses the acquire consumer's generate path (source:'generate').
  'engine.generate': (ctx, payload) => acquireHandler(ctx, { ...payload, source: 'generate' }),
  'engine.action': runActionTaskHandler,
  'engine.queue-fill': fillQueueHandler,
  'engine.bring-online': bringOnlineHandler,
  'engine.probe': probeHealthHandler,
  'engine.replace': replaceBannedHandler,
  'engine.warmup': warmupHandler,
  'engine.proxy-assign': assignProxyHandler
};

// Registers a DLQ-wrapped consumer per handler queue. Each consumer routes the
// job's payload to the handler with the engine ctx. consumeJson/publishJson are
// injectable for tests.
export function registerConsumers(ctx, {
  handlers = ENGINE_HANDLERS,
  consumeJson = coreConsumeJson,
  publishJson = corePublishJson
} = {}) {
  return Object.entries(handlers).map(([queue, handler]) =>
    consumeJsonWithDlq(
      queue,
      (job) => handler(ctx, job?.payload ?? job),
      { consumeJson, publishJson, clock: ctx.clock, logger: ctx.logger }
    )
  );
}
