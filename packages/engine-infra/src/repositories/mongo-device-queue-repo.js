// Generic MongoDeviceQueueRepo — persistence for EngineDeviceQueue, keyed by
// {deviceId, platform} (TZ §3.3/§4). Model injected; tenant-scoped (§14.2);
// opt-lock like the account repo (domain bumps version before save()).
import { conflictError } from '../errors.js';

function toFields(q) {
  return {
    activeSlots: q.activeSlots,
    targetDepth: q.targetDepth,
    activeAccountIds: q.activeAccountIds,
    waitingAccountIds: q.waitingAccountIds,
    version: q.version
  };
}

export function createMongoDeviceQueueRepo({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createMongoDeviceQueueRepo requires a mongoose model');
  return {
    async find(deviceId, platform) {
      return model.findOne({ tenantId, deviceId, platform }).lean();
    },
    async listAll(platform) {
      return model.find(platform ? { tenantId, platform } : { tenantId }).lean();
    },
    async ensureQueue(deviceId, platform, targetDepth) {
      return model
        .findOneAndUpdate(
          { tenantId, deviceId, platform },
          {
            $set: { targetDepth },
            $setOnInsert: {
              tenantId,
              deviceId,
              platform,
              activeSlots: 1,
              activeAccountIds: [],
              waitingAccountIds: [],
              version: 0
            }
          },
          { upsert: true, new: true }
        )
        .lean();
    },
    async save(queue) {
      const updated = await model.findOneAndUpdate(
        { tenantId, deviceId: queue.deviceId, platform: queue.platform, version: queue.version - 1 },
        { $set: toFields(queue) },
        { new: true }
      );
      if (!updated) throw conflictError(`queue ${queue.deviceId}/${queue.platform} version conflict`);
      return updated;
    }
  };
}
