import { makeEvent } from '@acq/engine-domain';

// run-action-task consumer (TZ §8.3). Exactly-once via upsertTask on the natural
// key; success is claimed only when the driver confirms (result.ok). A mid-flow
// ban is mapped to account.banned; anything else is a transient failure (task
// left 'failed' -> retried by the job ledger). Ports are injected via ctx.
export async function runActionTaskHandler(ctx, payload) {
  // Adapt the app Clock port ({ now }) to the bare clock() the domain expects.
  const clock = () => ctx.clock.now();
  const key = {
    campaignId: payload.campaignId,
    accountId: payload.accountId,
    target: payload.target,
    actionType: payload.actionType
  };

  await ctx.actionTaskRepo.upsertTask(key);
  await ctx.actionTaskRepo.markTask(key, 'running');

  const result = await ctx.automation.runAction(
    { accountId: payload.accountId },
    { type: payload.actionType, target: payload.target }
  );

  if (result?.banned) {
    await ctx.actionTaskRepo.markTask({ ...key, lastError: 'banned' }, 'failed');
    await ctx.eventBus.publish(makeEvent('account.banned', { accountId: payload.accountId }, { clock }));
    return { ok: false, banned: true };
  }

  if (result?.ok) {
    await ctx.actionTaskRepo.markTask(key, 'done');
    await ctx.eventBus.publish(makeEvent('action.done', key, { clock }));
    if (!(await ctx.actionTaskRepo.hasOpenTasks(payload.campaignId))) {
      await ctx.eventBus.publish(makeEvent('campaign.completed', { campaignId: payload.campaignId }, { clock }));
    }
    return { ok: true };
  }

  await ctx.actionTaskRepo.markTask({ ...key, lastError: result?.reason ?? 'not-confirmed' }, 'failed');
  return { ok: false };
}
