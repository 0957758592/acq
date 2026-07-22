import mongoose from 'mongoose';

// Immutable audit trail (TZ §14.7 / REQUIREM §4.7). Append-only: entries are
// only inserted, never updated or deleted. Records who/what/when for every
// mutating command and security event. `strict` drops unknown fields; secrets
// must be redacted by the caller before recording.
const engineAuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    operation: { type: String, trim: true, required: true, index: true },
    actor: { type: String, trim: true, default: null },
    role: { type: String, trim: true, default: null },
    subjectId: { type: String, trim: true, default: null, index: true },
    correlationId: { type: String, trim: true, default: null },
    args: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    at: { type: Date, default: () => new Date() }
  },
  { collection: 'engine_audit_logs', timestamps: false, minimize: false }
);

engineAuditLogSchema.index({ tenantId: 1, operation: 1, at: -1 });

// Enforce append-only at the model layer: block updates/removes.
const blockMutation = function blockMutation(next) {
  next(new Error('EngineAuditLog is append-only'));
};
engineAuditLogSchema.pre('updateOne', blockMutation);
engineAuditLogSchema.pre('findOneAndUpdate', blockMutation);
engineAuditLogSchema.pre('deleteOne', blockMutation);
engineAuditLogSchema.pre('deleteMany', blockMutation);

export const EngineAuditLog =
  mongoose.models.EngineAuditLog || mongoose.model('EngineAuditLog', engineAuditLogSchema);
