import { transition, evict, promoteNext, isMember, depth, makeEvent } from '@acq/engine-domain';

import { toDomainAccount, toDomainQueue } from './map.js';

// Generic replace-banned consumer (TZ §8.3) — any platform. Retires a banned
// account, evicts it from the device queue, promotes the next waiting account,
// and announces queue.low so the reconciler backfills.
export async function replaceBannedHandler(ctx, { accountId, deviceId, platform }) {
  const clock = () => ctx.clock.now();

  const [doc] = await ctx.accountRepo.find({ _id: accountId });
  platform = platform ?? doc?.platform;
  if (doc) {
    let account = toDomainAccount(doc);
    if (account.status === 'banned') {
      account = transition(account, 'retired', { clock });
      await ctx.accountRepo.save(account);
      await ctx.eventBus?.publish?.(makeEvent('account.retired', { accountId, platform }, { clock }));
    }
  }

  const queueDoc = await ctx.deviceQueueRepo.find(deviceId, platform);
  if (!queueDoc) return { ok: true, reason: 'no-queue' };

  let queue = toDomainQueue(queueDoc);
  if (isMember(queue, accountId)) {
    queue = evict(queue, accountId);
    await ctx.deviceQueueRepo.save(queue);
  }
  const { queue: after, promotedId } = promoteNext(queue);
  if (promotedId) await ctx.deviceQueueRepo.save(after);

  if (depth(after) < after.targetDepth) {
    await ctx.eventBus?.publish?.(makeEvent('queue.low', { deviceId, platform }, { clock }));
  }
  return { ok: true, promotedId };
}
