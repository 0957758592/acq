import { transition, recordProbe, accountBanned, domainError } from '@acq/whatsapp';
import { bareClock } from '@acq/whatsapp-infra';
import { toDomainAccount } from './map.js';

export async function probeHealthHandler(payload, ctx) {
  const { accountId, deviceId } = payload;
  const leased = await ctx.lease.claim(deviceId, ctx.owner);
  // Retriable: another owner holds the device now. Throw (transient) so runJob
  // re-queues instead of marking the run succeeded and dropping the probe.
  if (!leased) throw domainError('DEVICE_BUSY', `device ${deviceId} busy`);
  const clock = bareClock(ctx.clock);
  try {
    const [acctDoc] = await ctx.accountRepo.find({ _id: accountId });
    if (!acctDoc) return { skipped: true, reason: 'no-account' };
    let acct = toDomainAccount(acctDoc);
    const device = await ctx.deviceModel.findById(deviceId).lean();
    const state = await ctx.automation.probeState({ providerDeviceId: device?.providerDeviceId, account: acct });
    acct = recordProbe(acct, { healthy: state === 'online' }, { clock });   // single bump -> save
    await ctx.accountRepo.save(acct);
    if (state === 'banned') {
      acct = transition(acct, 'banned', { clock });                        // single bump -> save
      await ctx.accountRepo.save(acct);
      await ctx.eventBus.publish(accountBanned({ accountId: acct.id, deviceId }, { clock }));
      return { state, banned: true };
    }
    return { state, healthy: state === 'online' };
  } finally {
    await ctx.lease.release(deviceId, ctx.owner);
  }
}
