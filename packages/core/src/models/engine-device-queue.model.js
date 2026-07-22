import mongoose from 'mongoose';

// Generic per-device queue persistence (TZ §3.3/§12.2). Uniqueness key is
// {deviceId, platform} — one device may host several platforms. Opt-lock via
// version. deviceId is Mixed (ObjectId or provider string).
const engineDeviceQueueSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    deviceId: { type: mongoose.Schema.Types.Mixed, required: true },
    platform: { type: String, trim: true, required: true },
    activeSlots: { type: Number, default: 1 },
    targetDepth: { type: Number, default: 3 },
    activeAccountIds: { type: [mongoose.Schema.Types.Mixed], default: () => [] },
    waitingAccountIds: { type: [mongoose.Schema.Types.Mixed], default: () => [] },
    version: { type: Number, default: 0 }
  },
  { collection: 'engine_device_queues', timestamps: true }
);

engineDeviceQueueSchema.index({ deviceId: 1, platform: 1 }, { unique: true });
engineDeviceQueueSchema.index({ tenantId: 1, platform: 1 });

export const EngineDeviceQueue =
  mongoose.models.EngineDeviceQueue || mongoose.model('EngineDeviceQueue', engineDeviceQueueSchema);
