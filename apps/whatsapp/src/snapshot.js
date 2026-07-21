// snapshot.js — builds the read-model the pure domain `reconcile(snapshot)`
// (@acq/whatsapp) consumes. Collaborators are injected via `ctx` so the
// projection stays a pure function of its ports (DI-testable, no globals).
//
// Output shape (must match reconcile.js EXACTLY):
//   { pool: { available },
//     devices: [{ eligible, queue: { deviceId, activeSlots, targetDepth,
//                 activeAccountIds, waitingAccountIds },
//                 bannedActiveAccountIds, onlineAccountIds }],
//     campaigns: [{ id, status, targets, strategy, doneKeys }],
//     config }
import { canDeviceAcceptAccount } from '@acq/core/utils/device-account-eligibility';

export async function buildSnapshot({ accountRepo, deviceQueueRepo, reportRepo, deviceModel, config }) {
  const available = await accountRepo.countAvailable();
  const queues = await deviceQueueRepo.listAll();

  const devices = [];
  for (const q of queues) {
    const device = await deviceModel.findById(q.deviceId).lean();
    const eligible = Boolean(device) && canDeviceAcceptAccount(device).ok && device.status === 'running';
    const activeIds = (q.activeAccountIds || []).map(String);
    const activeAccounts = activeIds.length
      ? await accountRepo.find({ _id: { $in: q.activeAccountIds } })
      : [];
    const statusById = new Map(activeAccounts.map((a) => [String(a._id), a.status]));
    devices.push({
      eligible,
      queue: {
        deviceId: String(q.deviceId),
        activeSlots: q.activeSlots,
        targetDepth: q.targetDepth,
        activeAccountIds: activeIds,
        waitingAccountIds: (q.waitingAccountIds || []).map(String)
      },
      bannedActiveAccountIds: activeIds.filter((id) => statusById.get(id) === 'banned'),
      onlineAccountIds: activeIds.filter((id) => statusById.get(id) === 'online')
    });
  }

  const activeCampaigns = await reportRepo.listActiveCampaigns();
  const campaigns = [];
  for (const c of activeCampaigns) {
    const done = await reportRepo.doneKeys(c._id);
    campaigns.push({
      id: String(c._id),
      status: c.status,
      targets: c.targets || [],
      strategy: c.strategy,
      doneKeys: Array.from(done)
    });
  }

  return {
    pool: { available },
    devices,
    campaigns,
    config: {
      poolThreshold: config.poolThreshold,
      buyBatchSize: config.buyBatchSize,
      autobuyEnabled: config.autobuyEnabled
    }
  };
}
