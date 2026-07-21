import { reportTaskKey } from '@acq/whatsapp';

// Pure translation of reconcile() intents into idempotent job dispatches.
// Each intent maps to one or more `jobDispatcher.dispatch(queue, job, { idempotencyKey })`
// calls. Idempotency keys are stable per logical unit of work so retries and
// overlapping reconcile ticks collapse to a single job.
export async function dispatchIntents(intents, { jobDispatcher, clock }) {
  const bucket = clock.now().toISOString().slice(0, 13); // yyyy-mm-ddThh
  const results = [];

  for (const intent of intents) {
    switch (intent.type) {
      case 'buy':
        results.push(
          await jobDispatcher.dispatch(
            'whatsapp.buy',
            { jobName: 'buy-accounts', payload: { quantity: intent.quantity } },
            { idempotencyKey: `buy:${bucket}` }
          )
        );
        break;

      case 'fill-queue':
        results.push(
          await jobDispatcher.dispatch(
            'whatsapp.queue-fill',
            { jobName: 'fill-queue', payload: { deviceId: intent.deviceId, count: intent.count } },
            { idempotencyKey: `fill:${intent.deviceId}:${bucket}` }
          )
        );
        break;

      case 'bring-online':
        results.push(
          await jobDispatcher.dispatch(
            'whatsapp.bring-online',
            { jobName: 'bring-online', payload: { deviceId: intent.deviceId, accountId: intent.accountId } },
            { idempotencyKey: `online:${intent.accountId}:${bucket}` }
          )
        );
        break;

      case 'evict':
        results.push(
          await jobDispatcher.dispatch(
            'whatsapp.replace',
            { jobName: 'replace-banned', payload: { deviceId: intent.deviceId, accountId: intent.accountId } },
            { idempotencyKey: `evict:${intent.accountId}:${bucket}` }
          )
        );
        break;

      case 'expand-reports':
        for (const task of intent.tasks) {
          results.push(
            await jobDispatcher.dispatch(
              'whatsapp.report',
              {
                jobName: 'run-report-task',
                payload: {
                  campaignId: task.campaignId,
                  accountId: task.accountId,
                  targetMsisdn: task.targetMsisdn
                }
              },
              { idempotencyKey: `${reportTaskKey(task)}:${bucket}` }
            )
          );
        }
        break;

      default:
        // Unknown intent types are ignored; reconcile() only emits known types.
        break;
    }
  }

  return results;
}
