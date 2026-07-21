import { needsReplenish, buyQuantity } from './pool/pool-policy.js';
import { expandReportTasks } from './report/strategy.js';

function poolIntents(snapshot) {
  const { pool, config } = snapshot;
  if (!config.autobuyEnabled) return [];
  if (!needsReplenish({ available: pool.available, threshold: config.poolThreshold })) return [];
  const quantity = buyQuantity({
    available: pool.available,
    threshold: config.poolThreshold,
    batchSize: config.buyBatchSize
  });
  return [{ type: 'buy', quantity }];
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
      intents.push({ type: 'fill-queue', deviceId: queue.deviceId, count });
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

function reportIntents(snapshot) {
  const onlineAccountIds = snapshot.devices.flatMap((d) => d.onlineAccountIds || []);
  const intents = [];
  for (const campaign of snapshot.campaigns) {
    if (campaign.status !== 'active') continue;
    const tasks = expandReportTasks({
      campaign,
      onlineAccountIds,
      doneKeys: new Set(campaign.doneKeys || [])
    });
    if (tasks.length > 0) {
      intents.push({ type: 'expand-reports', campaignId: campaign.id, tasks });
    }
  }
  return intents;
}

export function reconcile(snapshot) {
  return [
    ...poolIntents(snapshot),
    ...deviceIntents(snapshot),
    ...reportIntents(snapshot)
  ];
}
