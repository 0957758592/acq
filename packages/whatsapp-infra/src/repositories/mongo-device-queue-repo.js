// MongoDeviceQueueRepo — persistence port for whatsapp_device_queues.
//
// Optimistic locking contract (mirrors MongoAccountRepo):
//   The pure domain (@acq/whatsapp) bumps `version` BEFORE this repo is
//   called. So save() opt-locks on the PRE-bump value: it matches
//   { deviceId, version: queue.version - 1 } and $set's the fields INCLUDING
//   the already-bumped `queue.version`. A null result means a concurrent
//   writer moved the version → we throw conflictError.
import { WhatsappDeviceQueue } from '../models/whatsapp-device-queue.model.js';
import { conflictError } from '../errors.js';

function toFields(q) {
  return {
    activeSlots: q.activeSlots, targetDepth: q.targetDepth,
    activeAccountIds: q.activeAccountIds, waitingAccountIds: q.waitingAccountIds,
    version: q.version
  };
}

export function createMongoDeviceQueueRepo({ model = WhatsappDeviceQueue } = {}) {
  return {
    async find(deviceId) { return model.findOne({ deviceId }).lean(); },
    async listAll() { return model.find({}).lean(); },
    async ensureQueue(deviceId, targetDepth) {
      return model.findOneAndUpdate(
        { deviceId },
        {
          $set: { targetDepth },
          $setOnInsert: { deviceId, activeSlots: 1, activeAccountIds: [], waitingAccountIds: [], version: 0 }
        },
        { upsert: true, new: true }
      ).lean();
    },
    async save(queue) {
      const previousVersion = queue.version - 1; // domain already bumped
      const updated = await model.findOneAndUpdate(
        { deviceId: queue.deviceId, version: previousVersion },
        { $set: toFields(queue) },
        { new: true }
      );
      if (!updated) throw conflictError(`queue ${queue.deviceId} version conflict`);
      return updated;
    }
  };
}
