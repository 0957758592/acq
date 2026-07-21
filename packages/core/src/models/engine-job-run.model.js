import mongoose from 'mongoose';

const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];

const jobRunSchema = new mongoose.Schema(
  {
    queueName: { type: String, trim: true, required: true, index: true },
    jobName: { type: String, trim: true, required: true, index: true },
    idempotencyKey: { type: String, trim: true, required: true },
    status: { type: String, enum: JOB_STATUSES, default: 'queued', index: true },
    targetType: { type: String, trim: true, default: '', index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    result: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    workerId: { type: String, trim: true, default: '' },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null, index: true },
    lastError: {
      code: { type: String, trim: true, default: '' },
      message: { type: String, trim: true, default: '' },
      stack: { type: String, default: '' }
    }
  },
  { collection: 'engine_job_runs', timestamps: true }
);

jobRunSchema.index({ queueName: 1, idempotencyKey: 1 }, { unique: true });
jobRunSchema.index({ status: 1, nextRetryAt: 1 });

export const EngineJobRun =
  mongoose.models.EngineJobRun || mongoose.model('EngineJobRun', jobRunSchema);
