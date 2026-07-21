import mongoose from 'mongoose';

const PROXY_TYPES = ['residential', 'mobile', 'datacenter'];
const PROXY_ROTATIONS = ['static', 'dynamic'];
const PROXY_STATUSES = ['available', 'assigned', 'unhealthy', 'retired'];

const proxyHealthSchema = new mongoose.Schema(
  {
    ok: { type: Boolean, default: false },
    ip: { type: String, trim: true, default: '' },
    geo: { type: String, trim: true, default: '' },
    latencyMs: { type: Number, default: null },
    lastCheckAt: { type: Date, default: null }
  },
  { _id: false }
);

const engineProxySchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    // Free-form: proxy vendors are Open/Closed (vmos, 922proxy, iproyal, brightdata, …).
    provider: { type: String, trim: true, required: true, index: true },
    providerProxyId: { type: String, trim: true, required: true },
    type: { type: String, enum: PROXY_TYPES, default: 'residential', index: true },
    rotation: { type: String, enum: PROXY_ROTATIONS, default: 'static' },
    geo: { type: String, trim: true, default: '' },
    status: { type: String, enum: PROXY_STATUSES, default: 'available', index: true },
    // Credentials (user:pass/endpoint) live in vault; DB holds only the ref.
    secretRef: { type: String, trim: true, default: '' },
    health: { type: proxyHealthSchema, default: () => ({}) },
    // Denormalized pointer; the canonical 1:1 link is EngineProxyAssignment.
    assignedDeviceId: { type: String, trim: true, default: '' },
    retiredAt: { type: Date, default: null },
    version: { type: Number, default: 0 }
  },
  { collection: 'engine_proxies', timestamps: true }
);

engineProxySchema.index({ provider: 1, providerProxyId: 1 }, { unique: true });
engineProxySchema.index({ tenantId: 1, status: 1, type: 1 });

export const EngineProxy =
  mongoose.models.EngineProxy || mongoose.model('EngineProxy', engineProxySchema);

export { PROXY_TYPES, PROXY_ROTATIONS, PROXY_STATUSES };
