import mongoose from 'mongoose';

const PROVIDERS = ['vmos', 'duoplus'];
const DEVICE_STATUSES = ['provisioning', 'stopped', 'starting', 'running', 'unhealthy', 'retired'];

const deviceRuntimeSchema = new mongoose.Schema(
  {
    adbAddress: { type: String, trim: true, default: '' },
    adbPassword: { type: String, trim: true, default: '' },
    screenWidth: { type: Number, default: 720 },
    screenHeight: { type: Number, default: 1280 },
    lastScreenshotUrl: { type: String, trim: true, default: '' },
    lastHeartbeatAt: { type: Date, default: null }
  },
  { _id: false }
);

const deviceCapacitySchema = new mongoose.Schema(
  {
    maxAccounts: { type: Number, default: 1 },
    activeAccountCount: { type: Number, default: 0 },
    operationConcurrency: { type: Number, default: 1 }
  },
  { _id: false }
);

const deviceProviderMetaSchema = new mongoose.Schema(
  {
    rawStatus: { type: Number, default: null },
    os: { type: String, trim: true, default: '' },
    ip: { type: String, trim: true, default: '' },
    proxyId: { type: String, trim: true, default: '' },
    proxyIp: { type: String, trim: true, default: '' },
    proxyConfigured: { type: Boolean, default: false },
    expiredAt: { type: String, trim: true, default: '' },
    subscriptionVerified: { type: Boolean, default: false },
    subscriptionStatus: { type: String, trim: true, default: '' },
    subscriptionExpiresAt: { type: String, trim: true, default: '' },
    installedApps: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
  },
  { _id: false }
);

const engineDeviceSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: PROVIDERS, default: 'vmos', index: true },
    providerDeviceId: { type: String, trim: true, required: true },
    name: { type: String, trim: true, default: '' },
    status: { type: String, enum: DEVICE_STATUSES, default: 'stopped', index: true },
    region: { type: String, trim: true, default: '' },
    groupName: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    runtime: { type: deviceRuntimeSchema, default: () => ({}) },
    capacity: { type: deviceCapacitySchema, default: () => ({}) },
    providerMeta: { type: deviceProviderMetaSchema, default: () => ({}) },
    leasedUntil: { type: Date, default: null, index: true },
    leasedBy: { type: String, trim: true, default: '', index: true },
    retiredAt: { type: Date, default: null }
  },
  { collection: 'engine_devices', timestamps: true }
);

engineDeviceSchema.index({ provider: 1, providerDeviceId: 1 }, { unique: true });
engineDeviceSchema.index({ status: 1, leasedUntil: 1, updatedAt: 1 });

export const EngineDevice =
  mongoose.models.EngineDevice || mongoose.model('EngineDevice', engineDeviceSchema);

export { PROVIDERS };
