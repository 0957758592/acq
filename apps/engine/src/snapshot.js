// Projects a reconcile snapshot for a platform from the live repositories
// (TZ §8.1). Pure aside from the repo reads it awaits. The device/campaign/proxy
// projections are wired as their repos land; the pool projection is live now.
export async function projectSnapshot(ctx, { platform, source = 'purchase' } = {}) {
  const available = await ctx.accountRepo.countAvailable({ platform, source });
  return {
    platform,
    config: {
      autobuyEnabled: ctx.config.autobuyEnabled,
      source,
      poolThreshold: ctx.config.poolThreshold,
      buyBatchSize: ctx.config.buyBatchSize
    },
    pool: { available },
    devices: [],
    campaigns: [],
    proxyPool: { available: 0, threshold: 0, batchSize: 1 }
  };
}

// Convenience: project + reconcile in one call.
export async function planForPlatform(ctx, opts) {
  const snapshot = await projectSnapshot(ctx, opts);
  return ctx.reconcile(snapshot);
}
