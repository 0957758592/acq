import { transition, markCheckpoint, makeEvent } from '@acq/engine-domain';

import { toDomainAccount } from './map.js';

// Generic bring-online consumer (TZ §8.3) — works for ANY platform via
// ctx.automationFor(platform). Leases the device, walks the account through
// bringing_online -> online/banned/checkpointed, and reverts to assigned on a
// verify-by-fact seam (session-import unverified / no login) WITHOUT faking
// success. Ports injected via ctx.
// A verify-by-fact bring-online seam: the driver couldn't confirm the account
// online (unsupported online method, unrecognized login screen, missing creds,
// login/session not confirmed). ALL of these must fail safe (revert to assigned,
// report blocked) — never pretend online, never leave the account stuck.
function isOnlineSeam(code) {
  return code === 'ONLINE_METHOD_UNSUPPORTED'
    || /_UNVERIFIED$/.test(code || '')
    || /_CREDENTIALS_REQUIRED$/.test(code || '');
}

export async function bringOnlineHandler(ctx, { accountId, deviceId, platform: platformArg, proxyMode }) {
  const clock = () => ctx.clock.now();
  const claimed = await ctx.lease.claim(deviceId, ctx.owner);
  if (!claimed) {
    throw Object.assign(new Error(`DEVICE_BUSY: ${deviceId} is leased`), { code: 'DEVICE_BUSY' });
  }
  try {
    const [doc] = await ctx.accountRepo.find({ _id: accountId });
    if (!doc) return { ok: false, reason: 'account-not-found' };
    const platform = platformArg ?? doc.platform;

    let account = toDomainAccount(doc);
    account = transition(account, 'bringing_online', { clock });
    await ctx.accountRepo.save(account);

    const device = await ctx.deviceModel.findById(deviceId).lean();

    // Proxy enforcement (operator rule): unless proxyMode is 'off', an account must
    // only log in when the device egresses through a proxy — never on a bare IP.
    // Default 'required' (from config). Applies to EVERY platform. Fail safe: revert
    // to assigned and report blocked, never login unprotected.
    const effProxyMode = proxyMode ?? ctx.config?.proxyMode ?? 'required';
    if (effProxyMode === 'required' && typeof ctx.provider?.getDeviceProxy === 'function') {
      const proxy = await ctx.provider.getDeviceProxy(device?.providerDeviceId).catch(() => null);
      if (!proxy) {
        account = transition(account, 'assigned', { clock });
        await ctx.accountRepo.save(account);
        return { ok: false, blocked: 'PROXY_REQUIRED' };
      }
    }

    // No device provider wired -> automationFor is null. Fail SAFE (revert to
    // assigned, report the seam) instead of crashing — verify-by-fact, never fake.
    if (typeof ctx.automationFor !== 'function') {
      account = transition(account, 'assigned', { clock });
      await ctx.accountRepo.save(account);
      return { ok: false, blocked: 'AUTOMATION_UNAVAILABLE' };
    }
    const automation = ctx.automationFor(platform);

    let result;
    try {
      result = await automation.bringOnline({ providerDeviceId: device?.providerDeviceId, account: doc });
    } catch (err) {
      if (isOnlineSeam(err.code)) {
        // Fail safe: revert to assigned, report blocked — never pretend online.
        account = transition(account, 'assigned', { clock });
        await ctx.accountRepo.save(account);
        return { ok: false, blocked: err.code };
      }
      throw err;
    }

    if (result?.banned) {
      account = transition(account, 'banned', { clock });
      await ctx.accountRepo.save(account);
      await ctx.eventBus?.publish?.(makeEvent('account.banned', { accountId, platform }, { clock }));
      return { ok: false, banned: true };
    }
    if (result?.checkpointed) {
      account = markCheckpoint(account, 'bring-online', { clock });
      await ctx.accountRepo.save(account);
      await ctx.eventBus?.publish?.(makeEvent('account.checkpointed', { accountId, platform }, { clock }));
      return { ok: false, checkpointed: true };
    }

    account = transition(account, 'online', { clock });
    await ctx.accountRepo.save(account);
    await ctx.eventBus?.publish?.(makeEvent('account.online', { accountId, platform }, { clock }));
    return { ok: true };
  } finally {
    await ctx.lease.release(deviceId, ctx.owner);
  }
}
