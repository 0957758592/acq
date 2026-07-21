import { transition, accountBanned, reportDone, campaignCompleted, domainError } from '@acq/whatsapp';
import { bareClock } from '@acq/whatsapp-infra';
import { toDomainAccount } from './map.js';

export async function runReportTaskHandler(payload, ctx) {
  const { campaignId, accountId, targetMsisdn } = payload;
  const clock = bareClock(ctx.clock);

  // Exactly-once: upsert the per-target task (unique index), short-circuit if already done.
  const task = await ctx.reportRepo.upsertTask({ campaignId, accountId, targetMsisdn });
  if (task?.status === 'done') return { skipped: true, reason: 'already-done' };

  const [acctDoc] = await ctx.accountRepo.find({ _id: accountId });
  if (!acctDoc) {
    await ctx.reportRepo.markTask(task._id, 'failed', 'no-account');
    return { ok: false, reason: 'no-account' };
  }
  const deviceId = acctDoc.assignedDeviceId != null ? String(acctDoc.assignedDeviceId) : null;
  if (!deviceId) {
    await ctx.reportRepo.markTask(task._id, 'failed', 'no-device');
    return { ok: false, reason: 'no-device' };
  }

  const leased = await ctx.lease.claim(deviceId, ctx.owner);
  // Retriable: another owner holds the device now. Throw (transient, BEFORE the
  // try) so runJob re-queues; nothing was leased, so no release is owed.
  if (!leased) throw domainError('DEVICE_BUSY', `device ${deviceId} busy`);
  try {
    const device = await ctx.deviceModel.findById(deviceId).lean();
    const acct = toDomainAccount(acctDoc);
    // Anti-abuse: the humanized rate-limit lives inside reportTarget (ui-flows human actor).
    const result = await ctx.automation.reportTarget(
      { providerDeviceId: device?.providerDeviceId, account: acct },
      targetMsisdn
    );

    if (result?.banned) {
      await ctx.reportRepo.markTask(task._id, 'failed', 'banned');
      const banned = transition(acct, 'banned', { clock });   // single bump -> save
      await ctx.accountRepo.save(banned);
      await ctx.eventBus.publish(accountBanned({ accountId, deviceId }, { clock }));
      return { ok: false, banned: true };
    }
    if (result?.ok) {
      await ctx.reportRepo.markTask(task._id, 'done');
      await ctx.eventBus.publish(reportDone({ campaignId, accountId, targetMsisdn }, { clock }));
      // Was that the campaign's last open task? If so, close it out and announce
      // completion so the orchestrator/brain can react (the previously-dead
      // campaign.completed subscription).
      if (!(await ctx.reportRepo.hasOpenTasks(campaignId))) {
        await ctx.reportRepo.setCampaignStatus(campaignId, 'completed');
        await ctx.eventBus.publish(campaignCompleted({ campaignId }, { clock }));
      }
      return { ok: true };
    }
    // Retriable: the report was not confirmed on-device. Mark the task failed,
    // then throw (transient, INSIDE the try so finally releases the lease) so
    // runJob re-queues instead of marking the run succeeded and dropping it.
    await ctx.reportRepo.markTask(task._id, 'failed', 'report-not-confirmed');
    throw domainError('REPORT_NOT_CONFIRMED', `report for ${accountId}→${targetMsisdn} not confirmed`);
  } finally {
    await ctx.lease.release(deviceId, ctx.owner);
  }
}
