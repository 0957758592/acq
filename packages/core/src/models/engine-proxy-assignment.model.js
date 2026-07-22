import mongoose from 'mongoose';

// Sticky 1:1 device<->proxy binding (TZ §5.9/§12.2). The unique index on
// deviceId enforces "one proxy per device" at the storage layer; the account
// behind the device keeps a stable IP until a controlled release.
const engineProxyAssignmentSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    deviceId: { type: mongoose.Schema.Types.Mixed, required: true },
    proxyId: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: Number, default: 0 }
  },
  { collection: 'engine_proxy_assignments', timestamps: true }
);

engineProxyAssignmentSchema.index({ deviceId: 1 }, { unique: true });
engineProxyAssignmentSchema.index({ proxyId: 1 });

export const EngineProxyAssignment =
  mongoose.models.EngineProxyAssignment ||
  mongoose.model('EngineProxyAssignment', engineProxyAssignmentSchema);
