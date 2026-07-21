import { transition, evict, promoteNext, depth, queueLow } from '@acq/whatsapp';
import { bareClock } from '@acq/whatsapp-infra';
import { toDomainAccount, toDomainQueue } from './map.js';

export async function replaceBannedHandler(payload, ctx) {
  const { deviceId, accountId } = payload;
  const clock = bareClock(ctx.clock);

  let retired = false;
  const [acctDoc] = await ctx.accountRepo.find({ _id: accountId });
  if (acctDoc) {
    let acct = toDomainAccount(acctDoc);
    if (acct.status === 'banned') {
      acct = transition(acct, 'retired', { clock });        // single bump -> save
      await ctx.accountRepo.save(acct);
      retired = true;
    }
  }

  const queueDoc = await ctx.deviceQueueRepo.find(deviceId);
  if (!queueDoc) return { retired, promoted: null };
  let queue = toDomainQueue(queueDoc);

  queue = evict(queue, accountId);                          // single bump -> save
  await ctx.deviceQueueRepo.save(queue);

  const promotion = promoteNext(queue);
  let promoted = promotion.promotedId;
  if (promoted) {
    queue = promotion.queue;                                // single bump -> save
    await ctx.deviceQueueRepo.save(queue);
  }

  if (depth(queue) < queue.targetDepth) {
    await ctx.eventBus.publish(queueLow({ deviceId, depth: depth(queue) }, { clock }));
  }
  return { retired, promoted };
}
