// Generic warmup consumer (TZ §8.3/§9.6) — runs the platform driver's warmup
// stages on the account's assigned device (browse/scroll/light-engagement) and
// records the new warmup level so the reconciler stops re-emitting warmup once
// the account is warm. Generic across ALL platforms via ctx.automationFor.
export async function warmupHandler(ctx, { accountId, deviceId, platform: platformArg }) {
  const [doc] = await ctx.accountRepo.find({ _id: accountId });
  if (!doc) return { ok: false, reason: 'account-not-found' };
  const platform = platformArg ?? doc.platform;
  if (!ctx.automationFor) return { ok: false, blocked: 'AUTOMATION_UNAVAILABLE' };

  const targetDeviceId = deviceId ?? doc.assignedDeviceId;
  const device = targetDeviceId ? await ctx.deviceModel.findById(targetDeviceId).lean() : null;
  const result = await ctx.automationFor(platform).warmup({ providerDeviceId: device?.providerDeviceId, account: doc });

  if (result?.ok ?? true) {
    const level = typeof result?.level === 'number' ? result.level : (doc.warmup?.level ?? 0) + 1;
    await ctx.accountRepo.setWarmup(accountId, { level, stage: result?.stage ?? 'warmed', updatedAt: ctx.clock ? ctx.clock.now() : undefined });
    return { ok: true, level, ...result };
  }
  return { ok: false, ...result };
}
