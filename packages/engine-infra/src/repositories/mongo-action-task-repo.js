// Generic MongoActionTaskRepo — exactly-once action-task persistence (TZ §4).
// The unique natural key {campaignId, accountId, target, actionType} plus an
// upsert with $setOnInsert guarantees at-most-one task per tuple. Model injected.
import { actionTaskKey } from '@acq/engine-domain';

function keyOf(task) {
  return { campaignId: task.campaignId, accountId: task.accountId, target: task.target, actionType: task.actionType };
}

export function createMongoActionTaskRepo({ model } = {}) {
  if (!model) throw new Error('createMongoActionTaskRepo requires a mongoose model');
  return {
    async upsertTask(task) {
      return model.findOneAndUpdate(
        keyOf(task),
        { $setOnInsert: { ...keyOf(task), status: 'pending', attempts: 0, lastError: null } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    },
    async markTask(key, status) {
      return model.findOneAndUpdate(
        keyOf(key),
        { $set: { status, lastError: status === 'failed' ? key.lastError ?? null : null }, $inc: { attempts: 1 } },
        { new: true }
      );
    },
    async doneKeys(campaignId) {
      const rows = await model.find({ campaignId, status: 'done' }).lean();
      return rows.map((r) => actionTaskKey(r));
    },
    async hasOpenTasks(campaignId) {
      const open = await model.countDocuments({ campaignId, status: { $in: ['pending', 'running'] } });
      return open > 0;
    }
  };
}
