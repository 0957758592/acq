import { conflictError } from '../errors.js';

// Generic MongoProxyRepo (TZ §5.9). Tenant-scoped persistence for the proxy pool
// + 1:1 sticky device↔proxy assignments. Model injected. Writes are optimistic-
// locked on `version` (conflict -> coded error), mirroring the account repo.
export function createMongoProxyRepo({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createMongoProxyRepo requires a mongoose model');
  return {
    async list(filter = {}) {
      return model.find({ tenantId, ...filter }).lean();
    },
    async findById(proxyId) {
      return model.findOne({ tenantId, _id: proxyId }).lean();
    },
    async findByDevice(deviceId) {
      return model.findOne({ tenantId, assignedDeviceId: deviceId }).lean();
    },
    async findAvailable({ geo } = {}) {
      return model.find({ tenantId, status: 'available', ...(geo ? { geo } : {}) }).lean();
    },
    async save({ _id, version, status, assignedDeviceId = '', health }) {
      const updated = await model.findOneAndUpdate(
        { _id, tenantId, version },
        { $set: { status, assignedDeviceId, ...(health ? { health } : {}) }, $inc: { version: 1 } },
        { new: true }
      );
      if (!updated) throw conflictError(`proxy ${_id} version conflict`);
      return updated.toObject ? updated.toObject() : updated;
    }
  };
}
