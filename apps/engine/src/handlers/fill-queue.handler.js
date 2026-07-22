import { assignToDevice, transition, enqueueWaiting, makeEvent } from '@acq/engine-domain';

import { toDomainAccount, toDomainQueue } from './map.js';

// fill-queue consumer (TZ §8.3): assign up to `count` acquired accounts to a
// device queue. No automation/device needed — pure domain moves + persistence.
// Each single version bump is saved immediately (opt-lock per mutation). A
// pool.low event fires on the fast path if filling drains the pool.
export async function fillQueueHandler(ctx, { deviceId, platform, count }) {
  const clock = () => ctx.clock.now();
  const queueDoc = await ctx.deviceQueueRepo.find(deviceId, platform);
  if (!queueDoc) return { filled: 0, reason: 'no-queue' };

  let queue = toDomainQueue(queueDoc);
  const poolDocs = await ctx.accountRepo.find({ platform, status: 'acquired', assignedDeviceId: null });
  const candidates = poolDocs.slice(0, count);

  let filled = 0;
  for (const doc of candidates) {
    let acct = toDomainAccount(doc);
    acct = assignToDevice(acct, deviceId);
    await ctx.accountRepo.save(acct);
    acct = transition(acct, 'assigned', { clock });
    await ctx.accountRepo.save(acct);
    queue = enqueueWaiting(queue, acct.id);
    await ctx.deviceQueueRepo.save(queue);
    filled += 1;
  }

  const available = await ctx.accountRepo.countAvailable({ platform });
  if (available < ctx.config.poolThreshold) {
    await ctx.eventBus.publish(makeEvent('pool.low', { platform, available }, { clock }));
  }
  return { filled };
}
