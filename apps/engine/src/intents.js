import { actionTaskKey } from '@acq/engine-domain';

// Pure translation of reconcile() intents into idempotent job dispatches
// (TZ §8.2). Idempotency keys are stable per logical unit of work (hourly
// bucket) so retries and overlapping reconcile ticks collapse to a single job.
export async function dispatchIntents(intents, { jobDispatcher, clock }) {
  const bucket = clock.now().toISOString().slice(0, 13); // yyyy-mm-ddThh
  const results = [];

  const send = (queue, jobName, payload, idempotencyKey) =>
    jobDispatcher.dispatch(queue, { jobName, payload }, { idempotencyKey });

  for (const intent of intents) {
    switch (intent.type) {
      case 'acquire':
        results.push(
          await send('engine.acquire', 'acquire', { platform: intent.platform, source: intent.source, quantity: intent.quantity }, `acquire:${intent.platform}:${bucket}`)
        );
        break;
      case 'generate':
        results.push(
          await send('engine.generate', 'generate', { platform: intent.platform, deviceId: intent.deviceId, count: intent.count }, `generate:${intent.deviceId}:${bucket}`)
        );
        break;
      case 'acquire-device':
        results.push(
          await send('engine.device-acquire', 'acquire-device', { provider: intent.provider, quantity: intent.quantity }, `acquire-device:${intent.provider}:${bucket}`)
        );
        break;
      case 'fill-queue':
        results.push(
          await send('engine.queue-fill', 'fill-queue', { deviceId: intent.deviceId, platform: intent.platform, count: intent.count }, `fill:${intent.deviceId}:${intent.platform}:${bucket}`)
        );
        break;
      case 'bring-online':
        results.push(
          await send('engine.bring-online', 'bring-online', { deviceId: intent.deviceId, accountId: intent.accountId }, `online:${intent.accountId}:${bucket}`)
        );
        break;
      case 'evict':
        results.push(
          await send('engine.replace', 'replace-banned', { deviceId: intent.deviceId, accountId: intent.accountId }, `evict:${intent.accountId}:${bucket}`)
        );
        break;
      case 'warmup':
        results.push(
          await send('engine.warmup', 'warmup', { deviceId: intent.deviceId, accountId: intent.accountId }, `warmup:${intent.accountId}:${bucket}`)
        );
        break;
      case 'acquire-proxy':
        results.push(
          await send('engine.proxy-acquire', 'acquire-proxy', { geo: intent.geo, quantity: intent.quantity }, `acquire-proxy:${intent.geo}:${bucket}`)
        );
        break;
      case 'assign-proxy':
        results.push(
          await send('engine.proxy-assign', 'assign-proxy', { deviceId: intent.deviceId }, `assign-proxy:${intent.deviceId}:${bucket}`)
        );
        break;
      case 'scrape':
        results.push(
          await send('engine.scrape', 'scrape-task', { platform: intent.platform, targetType: intent.targetType, target: intent.target, params: intent.params }, `scrape:${intent.target}:${bucket}`)
        );
        break;
      case 'expand-actions':
        for (const task of intent.tasks) {
          results.push(
            await send('engine.action', 'run-action-task', task, `${actionTaskKey(task)}:${bucket}`)
          );
        }
        break;
      default:
        // reconcile() only emits known types; ignore anything else.
        break;
    }
  }

  return results;
}
