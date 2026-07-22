import mongoose from 'mongoose';

// Exactly-once action task (TZ §3.5/§12.2). The unique natural key
// {campaignId, accountId, target, actionType} guarantees at-most-one task per
// tuple even under concurrent upserts.
const ACTION_TASK_STATUSES = ['pending', 'running', 'done', 'failed'];

const engineActionTaskSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    campaignId: { type: String, trim: true, required: true },
    accountId: { type: String, trim: true, required: true },
    target: { type: String, trim: true, required: true },
    actionType: { type: String, trim: true, required: true },
    status: { type: String, enum: ACTION_TASK_STATUSES, default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
    lastError: { type: String, trim: true, default: null }
  },
  { collection: 'engine_action_tasks', timestamps: true }
);

engineActionTaskSchema.index(
  { campaignId: 1, accountId: 1, target: 1, actionType: 1 },
  { unique: true }
);
engineActionTaskSchema.index({ tenantId: 1, campaignId: 1, status: 1 });

export const EngineActionTask =
  mongoose.models.EngineActionTask || mongoose.model('EngineActionTask', engineActionTaskSchema);

export { ACTION_TASK_STATUSES };
