import { consumeJsonWithDlq } from '@acq/engine-infra';
import { consumeJson as coreConsumeJson, publishJson as corePublishJson } from '@acq/core/queue/rabbitmq';

import { runActionTaskHandler } from './handlers/run-action-task.handler.js';
import { fillQueueHandler } from './handlers/fill-queue.handler.js';

// Queue -> handler map for the engine's job consumers (TZ §8.3). Handlers land
// here as their subsystems are wired; each is DLQ-wrapped with the retry ledger.
export const ENGINE_HANDLERS = {
  'engine.action': runActionTaskHandler,
  'engine.queue-fill': fillQueueHandler
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
