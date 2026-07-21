import { transition, accountBanned, domainError } from '@acq/whatsapp';
import { bareClock } from '@acq/whatsapp-infra';
import { toDomainAccount } from './map.js';

export async function bringOnlineHandler(payload, ctx) {
  const { deviceId, accountId } = payload;
  const leased = await ctx.lease.claim(deviceId, ctx.owner);
  // Retriable: another owner holds the device now. Throw (transient) so runJob
  // re-queues instead of marking the run succeeded and dropping the work.
  if (!leased) throw domainError('DEVICE_BUSY', `device ${deviceId} busy`);
  const clock = bareClock(ctx.clock);
  try {
    const [acctDoc] = await ctx.accountRepo.find({ _id: accountId });
    if (!acctDoc) return { skipped: true, reason: 'no-account' };
    let acct = toDomainAccount(acctDoc);

    acct = transition(acct, 'bringing_online', { clock });      // single bump -> save
    await ctx.accountRepo.save(acct);

    const device = await ctx.deviceModel.findById(deviceId).lean();
    const automationCtx = { providerDeviceId: device?.providerDeviceId, account: acct };

    let result;
    try {
      result = await ctx.automation.bringOnline(automationCtx);
    } catch (err) {
      if (err?.code === 'WHATSAPP_SESSION_IMPORT_UNVERIFIED') {
        // Plan 4 contract: blocked-on-session-format. Revert to waiting; do NOT thrash/DLQ.
        acct = transition(acct, 'assigned', { clock });          // single bump -> save
        await ctx.accountRepo.save(acct);
        ctx.logger?.warn?.('bring-online blocked: session-import unverified', { accountId, deviceId });
        return { blocked: true, reason: 'session-import-unverified' };
      }
      throw err;
    }

    if (result?.banned) {
      acct = transition(acct, 'banned', { clock });              // single bump -> save
      await ctx.accountRepo.save(acct);
      await ctx.eventBus.publish(accountBanned({ accountId: acct.id, deviceId }, { clock }));
      return { ok: false, banned: true };
    }

    acct = transition(acct, 'online', { clock });                // single bump -> save
    await ctx.accountRepo.save(acct);
    return { ok: true };
  } finally {
    await ctx.lease.release(deviceId, ctx.owner);
  }
}
