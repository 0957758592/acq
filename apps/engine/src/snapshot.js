// Projects a reconcile snapshot for a platform from the LIVE repositories
// (TZ §8.1). Real projection: pool availability, eligible devices with their
// queues + banned/online members, and active campaigns with their done-keys —
// so the generic reconciler emits the full intent set (fill-queue, bring-online,
// evict, warmup, action) for EVERY platform, not just a pool acquire.
export async function projectSnapshot(ctx, { platform, source = 'purchase' } = {}) {
  const available = await ctx.accountRepo.countAvailable({ platform, source });

  const devices = [];
  const deviceDocs = ctx.deviceModel ? await ctx.deviceModel.find({ status: 'running' }).lean() : [];
  for (const d of deviceDocs) {
    const deviceId = String(d._id);
    if (ctx.canDeviceAcceptAccount) {
      const elig = ctx.canDeviceAcceptAccount(d, platform, {
        maxAccountsPerDevice: ctx.capabilitiesOf?.(platform)?.maxAccountsPerDevice
      });
      if (elig && elig.ok === false) continue;
    }
    const queueDoc = ctx.deviceQueueRepo ? await ctx.deviceQueueRepo.find(deviceId, platform) : null;
    const queue = queueDoc
      ? {
          deviceId,
          platform,
          activeSlots: queueDoc.activeSlots ?? 1,
          targetDepth: queueDoc.targetDepth ?? 3,
          activeAccountIds: (queueDoc.activeAccountIds ?? []).map(String),
          waitingAccountIds: (queueDoc.waitingAccountIds ?? []).map(String)
        }
      : {
          deviceId,
          platform,
          activeSlots: d.capacity?.maxAccounts ?? 1,
          targetDepth: ctx.config?.deviceTargetDepth ?? 3,
          activeAccountIds: [],
          waitingAccountIds: []
        };

    const banned = await ctx.accountRepo.find({ platform, status: 'banned', assignedDeviceId: deviceId });
    const online = await ctx.accountRepo.find({ platform, status: 'online', assignedDeviceId: deviceId });

    // Warmup projection (gated by config.warmupTargetLevel > 0): an online
    // account below the target warmup level needs warmup. Default target 0 -> no
    // warmup intents, preserving prior behaviour until warmup is enabled.
    const warmupTarget = ctx.config?.warmupTargetLevel ?? 0;
    const warmupNeededAccountIds =
      warmupTarget > 0
        ? online.filter((a) => (a.warmup?.level ?? 0) < warmupTarget).map((a) => String(a._id ?? a.id))
        : [];

    // Proxy projection (gated by config.proxyEnabled): a device without a healthy
    // assigned proxy needs one. Default disabled -> hasHealthyProxy:true (no proxy
    // intents) until proxy management is turned on with a wired pool.
    let hasHealthyProxy = true;
    if (ctx.config?.proxyEnabled && ctx.proxyRepo) {
      const assigned = await ctx.proxyRepo.findByDevice(deviceId);
      hasHealthyProxy = Boolean(assigned && assigned.health?.ok === true);
    }

    devices.push({
      deviceId,
      eligible: true,
      queue,
      bannedActiveAccountIds: banned.map((a) => String(a._id ?? a.id)),
      onlineAccountIds: online.map((a) => String(a._id ?? a.id)),
      warmupNeededAccountIds,
      hasHealthyProxy
    });
  }

  // Proxy pool projection (gated) — real available count vs threshold so the
  // reconciler can auto-replenish only when proxy management is enabled.
  let proxyPool = { available: 0, threshold: 0, batchSize: 1 };
  if (ctx.config?.proxyEnabled && ctx.proxyRepo) {
    const availableProxies = await ctx.proxyRepo.findAvailable({});
    proxyPool = {
      available: availableProxies.length,
      threshold: ctx.config?.proxyPoolThreshold ?? 0,
      batchSize: ctx.config?.proxyBatchSize ?? 1,
      geo: ctx.config?.proxyGeo
    };
  }

  const campaigns = [];
  const campaignDocs = ctx.campaignRepo ? await ctx.campaignRepo.listActiveCampaigns(platform) : [];
  for (const c of campaignDocs) {
    const id = String(c._id ?? c.id);
    const doneKeys = ctx.actionTaskRepo ? await ctx.actionTaskRepo.doneKeys(id) : [];
    campaigns.push({
      id,
      platform,
      actionType: c.actionType,
      status: c.status,
      strategy: c.strategy,
      targets: c.targets ?? [],
      params: c.params ?? {},
      doneKeys
    });
  }

  return {
    platform,
    config: {
      autobuyEnabled: ctx.config.autobuyEnabled,
      source,
      poolThreshold: ctx.config.poolThreshold,
      buyBatchSize: ctx.config.buyBatchSize
    },
    pool: { available },
    devices,
    campaigns,
    proxyPool
  };
}

// Convenience: project + reconcile in one call.
export async function planForPlatform(ctx, opts) {
  const snapshot = await projectSnapshot(ctx, opts);
  return ctx.reconcile(snapshot);
}
