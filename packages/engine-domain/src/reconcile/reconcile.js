import { needsReplenish, buyQuantity } from '../pool/pool-policy.js';
import { expandActionTasks } from '../campaign/action.js';

// Pure desired-vs-actual reconciler (TZ §8.1): reconcile(snapshot) -> Intent[].
// A composition of independent planners. Deterministic, side-effect-free — the
// engine translates intents into idempotent jobs (§8.2).

function poolIntents(snapshot) {
  const { pool, config, platform } = snapshot;
  if (!config.autobuyEnabled) return [];
  if (!needsReplenish({ available: pool.available, threshold: config.poolThreshold })) return [];
  const quantity = buyQuantity({
    available: pool.available,
    threshold: config.poolThreshold,
    batchSize: config.buyBatchSize
  });
  return [{ type: 'acquire', platform, source: config.source || 'purchase', quantity }];
}

function deviceIntents(snapshot) {
  const intents = [];
  let poolBudget = snapshot.pool.available;
  for (const device of snapshot.devices) {
    if (!device.eligible) continue;
    const { queue } = device;
    const banned = device.bannedActiveAccountIds || [];
    for (const accountId of banned) {
      intents.push({ type: 'evict', deviceId: queue.deviceId, accountId });
    }
    const effectiveActive = queue.activeAccountIds.filter((id) => !banned.includes(id));
    const currentDepth = effectiveActive.length + queue.waitingAccountIds.length;
    const missing = queue.targetDepth - currentDepth;
    if (missing > 0 && poolBudget > 0) {
      const count = Math.min(missing, poolBudget);
      intents.push({ type: 'fill-queue', deviceId: queue.deviceId, platform: queue.platform, count });
      poolBudget -= count;
    }
    const freeSlot = effectiveActive.length < queue.activeSlots;
    const nextWaiting = queue.waitingAccountIds[0];
    if (freeSlot && nextWaiting) {
      intents.push({ type: 'bring-online', deviceId: queue.deviceId, accountId: nextWaiting });
    }
  }
  return intents;
}

function warmupIntents(snapshot) {
  const intents = [];
  for (const device of snapshot.devices) {
    if (!device.eligible) continue;
    for (const accountId of device.warmupNeededAccountIds || []) {
      intents.push({ type: 'warmup', deviceId: device.queue.deviceId, accountId });
    }
  }
  return intents;
}

function proxyIntents(snapshot) {
  const intents = [];
  const proxyPool = snapshot.proxyPool || { available: 0, threshold: 0 };
  if (needsReplenish({ available: proxyPool.available, threshold: proxyPool.threshold })) {
    intents.push({
      type: 'acquire-proxy',
      geo: proxyPool.geo,
      quantity: buyQuantity({
        available: proxyPool.available,
        threshold: proxyPool.threshold,
        batchSize: proxyPool.batchSize || 1
      })
    });
  }
  for (const device of snapshot.devices) {
    if (!device.eligible) continue;
    if (device.hasHealthyProxy === false) {
      intents.push({ type: 'assign-proxy', deviceId: device.queue.deviceId });
    }
  }
  return intents;
}

function actionIntents(snapshot) {
  const onlineAccountIds = snapshot.devices.flatMap((d) => d.onlineAccountIds || []);
  const intents = [];
  for (const campaign of snapshot.campaigns) {
    if (campaign.status !== 'active') continue;
    const tasks = expandActionTasks({
      campaign,
      onlineAccountIds,
      doneKeys: new Set(campaign.doneKeys || [])
    });
    if (tasks.length > 0) {
      intents.push({ type: 'expand-actions', campaignId: campaign.id, tasks });
    }
  }
  return intents;
}

export function reconcile(snapshot) {
  return [
    ...poolIntents(snapshot),
    ...proxyIntents(snapshot),
    ...deviceIntents(snapshot),
    ...warmupIntents(snapshot),
    ...actionIntents(snapshot)
  ];
}
