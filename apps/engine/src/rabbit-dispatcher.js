import { publishJson } from '@acq/core/queue/rabbitmq';

// Minimal RabbitMQ JobDispatcher for the engine. Publishes each job to its
// durable queue with the idempotency key embedded, so a downstream consumer's
// EngineJobRun ledger can dedup (TZ §8.4). publishJson is injectable for tests.
export function createRabbitJobDispatcher({ publish = publishJson } = {}) {
  return {
    async dispatch(queue, job, opts = {}) {
      await publish(queue, { ...job, idempotencyKey: opts.idempotencyKey });
      return { jobRunId: opts.idempotencyKey ?? null };
    }
  };
}
