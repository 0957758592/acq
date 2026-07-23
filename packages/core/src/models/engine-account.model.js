import mongoose from 'mongoose';

// Generalized account persistence (TZ §3.1/§12.2). Platform-parameterized,
// multi-tenant, 8-state, opt-lock via version. Secrets are refs only.
const ACCOUNT_STATUSES = [
  'acquired', 'assigned', 'bringing_online', 'online',
  'cooldown', 'checkpointed', 'banned', 'retired'
];

const healthSchema = new mongoose.Schema(
  {
    consecutiveFailures: { type: Number, default: 0 },
    dailyActionCount: { type: Number, default: 0 },
    hourlyActionCount: { type: Number, default: 0 },
    lastProbeAt: { type: Date, default: null }
  },
  { _id: false }
);

const warmupSchema = new mongoose.Schema(
  { level: { type: Number, default: 0 }, stage: { type: String, default: '' }, updatedAt: { type: Date, default: null } },
  { _id: false }
);

const acquisitionSchema = new mongoose.Schema(
  {
    externalOrderId: { type: String, trim: true, default: null },
    priceUsdCents: { type: Number, default: null },
    priceRub: { type: Number, default: null },
    acquiredAt: { type: Date, default: null }
  },
  { _id: false }
);

const engineAccountSchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    platform: { type: String, trim: true, required: true },
    identifier: { type: String, trim: true, required: true },
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'acquired', index: true },
    source: { type: String, enum: ['purchase', 'generate'], default: 'purchase' },
    shopId: { type: String, trim: true, default: null },
    // Vaulted secret REFERENCES only (never raw secrets), TZ §3.1/§14.4. The
    // procurement → insertAcquired → bringOnline pipeline reads/writes secrets
    // here (e.g. `secretRefs.session` for session-import); the resolver
    // dereferences the ref on-device. `credentials`/`session` below hold
    // structured login fields (username/password) consumed by the drivers.
    secretRefs: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    credentials: { secretRefs: { type: mongoose.Schema.Types.Mixed, default: () => ({}) } },
    session: { secretRef: { type: String, trim: true, default: '' } },
    profile: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    health: { type: healthSchema, default: () => ({}) },
    warmup: { type: warmupSchema, default: () => ({}) },
    assignedDeviceId: { type: String, trim: true, default: null },
    assignedProxyId: { type: String, trim: true, default: null },
    personaRef: { type: String, trim: true, default: null },
    checkpointReason: { type: String, trim: true, default: null },
    tags: { type: [String], default: () => [] },
    acquisition: { type: acquisitionSchema, default: () => ({}) },
    version: { type: Number, default: 0 }
  },
  { collection: 'engine_accounts', timestamps: true }
);

engineAccountSchema.index({ tenantId: 1, platform: 1, identifier: 1 }, { unique: true });
engineAccountSchema.index({ tenantId: 1, status: 1, platform: 1 });
engineAccountSchema.index({ status: 1, assignedDeviceId: 1 });
engineAccountSchema.index({ 'acquisition.externalOrderId': 1 }, { sparse: true });

export const EngineAccount =
  mongoose.models.EngineAccount || mongoose.model('EngineAccount', engineAccountSchema);

export { ACCOUNT_STATUSES };
