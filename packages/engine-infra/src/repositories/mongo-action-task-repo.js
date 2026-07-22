// Generic MongoActionTaskRepo — exactly-once action-task persistence (TZ §4).
// The unique natural key {campaignId, accountId, target, actionType} plus an
// upsert with $setOnInsert guarantees at-most-one task per tuple. Model injected;
// tenant-scoped (§14.2).
import { actionTaskKey } from '@acq/engine-domain';

export function createMongoActionTaskRepo({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createMongoActionTaskRepo requires a mongoose model');

  const keyOf = (task) => ({
    tenantId,
    campaignId: task.campaignId,
    accountId: task.accountId,
    target: task.target,
    actionType: task.actionType
  });

  return {
    async upsertTask(task) {
      try {
        return await model.findOneAndUpdate(
          keyOf(task),
          { $setOnInsert: { ...keyOf(task), status: 'pending', attempts: 0, lastError: null } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        // Concurrent upserts on the unique natural key can race to insert; the
        // loser gets E11000. That IS exactly-once (one row won) — resolve to the
        // existing task instead of failing.
        if (err?.code === 11000) return model.findOne(keyOf(task));
        throw err;
      }
    },
    async markTask(key, status) {
      return model.findOneAndUpdate(
        keyOf(key),
        { $set: { status, lastError: status === 'failed' ? key.lastError ?? null : null }, $inc: { attempts: 1 } },
        { new: true }
      );
    },
    async doneKeys(campaignId) {
      const rows = await model.find({ tenantId, campaignId, status: 'done' }).lean();
      return rows.map((r) => actionTaskKey(r));
    },
    async hasOpenTasks(campaignId) {
      const open = await model.countDocuments({ tenantId, campaignId, status: { $in: ['pending', 'running'] } });
      return open > 0;
    }
  };
}
