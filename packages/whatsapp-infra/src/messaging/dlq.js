// DLQ wrapper over the engine's `consumeJson`.
//
// The real `consumeJson(queueName, handler, opts)` drops a message on handler
// throw (nack + requeueOnError=false). Retry durability lives in Mongo, not the
// broker. This wrapper adds a dead-letter queue: terminal failures are recorded
// to `${queueName}.dlq` and then swallowed (so the original is ACKed and stops
// recirculating), while transient failures are re-thrown so the underlying
// consumer nack-drops them and Mongo's ledger/retry cron re-delivers later.

const isTerminal = (error, maxAttempts) => {
  if (error?.permanent === true) return true;
  if (typeof error?.attempts === 'number') {
    return error.attempts >= (error.maxAttempts ?? maxAttempts);
  }
  return false;
};

export function consumeJsonWithDlq(queueName, handler, {
  maxAttempts = 3,
  prefetch = 1,
  requeueOnError = false,
  publishJson,
  consumeJson,
  clock = { now: () => new Date() },
  logger
} = {}) {
  const wrapped = async (payload) => {
    try {
      await handler(payload);
    } catch (error) {
      if (!isTerminal(error, maxAttempts)) {
        // Transient: re-throw so the underlying consumer nack-drops it and the
        // Mongo ledger / retry cron re-delivers later. No DLQ publish.
        throw error;
      }
      const code = error.code ?? null;
      try {
        await publishJson(`${queueName}.dlq`, {
          reason: error.message,
          code,
          payload,
          failedAt: clock.now().toISOString()
        });
        logger?.error?.('job dead-lettered', { queue: queueName, code });
        // Swallow: returning normally lets the underlying consumer ACK the
        // original message. It's now recorded in the `.dlq`.
        return;
      } catch (publishErr) {
        // The DLQ publish itself failed (e.g. broker down). Do NOT silently lose
        // the message: log loudly and re-throw the ORIGINAL error so the
        // underlying consumer nack-drops it and Mongo re-delivery retries the
        // handler (and the DLQ publish) once the broker recovers.
        logger?.error?.('dlq publish failed', {
          queue: queueName,
          code,
          reason: error.message,
          publishError: publishErr.message
        });
        throw error;
      }
    }
  };

  return consumeJson(queueName, wrapped, { prefetch, requeueOnError });
}
