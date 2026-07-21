import { assignToDevice, transition, enqueueWaiting, poolLow } from '@acq/whatsapp';
import { bareClock } from '@acq/whatsapp-infra';
import { toDomainAccount, toDomainQueue } from './map.js';

export async function fillQueueHandler(payload, ctx) {
  const { deviceId, count } = payload;
  const queueDoc = await ctx.deviceQueueRepo.find(deviceId);
  if (!queueDoc) return { filled: 0, reason: 'no-queue' };
  let queue = toDomainQueue(queueDoc);
  const poolDocs = await ctx.accountRepo.find({ status: 'purchased', assignedDeviceId: null });
  const candidates = poolDocs.slice(0, count);
  const clock = bareClock(ctx.clock);
  let filled = 0;
  for (const doc of candidates) {
    let acct = toDomainAccount(doc);
    acct = assignToDevice(acct, deviceId);          // single bump
    await ctx.accountRepo.save(acct);
    acct = transition(acct, 'assigned', { clock }); // single bump
    await ctx.accountRepo.save(acct);
    queue = enqueueWaiting(queue, acct.id);          // single bump
    await ctx.deviceQueueRepo.save(queue);
    filled += 1;
  }
  // Low-latency fast-path: filling may have drained the pool below the threshold.
  // Announce pool.low so the reconciler/brain reacts immediately (rather than
  // waiting for the next periodic reconcile tick).
  const available = await ctx.accountRepo.countAvailable();
  if (available < ctx.config.poolThreshold) {
    await ctx.eventBus.publish(poolLow({ available }, { clock }));
  }
  return { filled };
}
