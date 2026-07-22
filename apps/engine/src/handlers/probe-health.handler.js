import { transition, markCheckpoint, recordProbe, makeEvent } from '@acq/engine-domain';

import { toDomainAccount } from './map.js';

// Generic probe-health consumer (TZ §8.3) — any platform via automationFor.
// Probes the live state, records the probe, and reacts: banned -> banned event,
// checkpoint -> checkpointed, logged_out -> bringing_online (re-login), online ->
// healthy. logged_out is a probe RESULT, not a state.
export async function probeHealthHandler(ctx, { accountId, deviceId, platform }) {
  const clock = () => ctx.clock.now();
  const claimed = await ctx.lease.claim(deviceId, ctx.owner);
  if (!claimed) throw Object.assign(new Error(`DEVICE_BUSY: ${deviceId}`), { code: 'DEVICE_BUSY' });
  try {
    const [doc] = await ctx.accountRepo.find({ _id: accountId });
    if (!doc) return { ok: false, reason: 'account-not-found' };
    platform = platform ?? doc.platform;

    const device = await ctx.deviceModel.findById(deviceId).lean();
    const automation = ctx.automationFor(platform);
    const state = await automation.probeState({ providerDeviceId: device?.providerDeviceId, account: doc });

    let account = toDomainAccount(doc);
    account = recordProbe(account, { healthy: state === 'online' }, { clock });
    await ctx.accountRepo.save(account);

    if (state === 'banned') {
      account = transition(account, 'banned', { clock });
      await ctx.accountRepo.save(account);
      await ctx.eventBus.publish(makeEvent('account.banned', { accountId, platform }, { clock }));
      return { state, banned: true };
    }
    if (state === 'checkpointed') {
      account = markCheckpoint(account, 'probe', { clock });
      await ctx.accountRepo.save(account);
      await ctx.eventBus.publish(makeEvent('account.checkpointed', { accountId, platform }, { clock }));
      return { state, checkpointed: true };
    }
    if (state === 'logged_out') {
      account = transition(account, 'bringing_online', { clock });
      await ctx.accountRepo.save(account);
      return { state, relogin: true };
    }
    return { ok: true, state };
  } finally {
    await ctx.lease.release(deviceId, ctx.owner);
  }
}
