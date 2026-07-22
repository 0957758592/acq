// Generic MongoAccountRepo — persistence for EngineAccount, generalized from
// the whatsapp vertical (TZ §4). The mongoose model is INJECTED so this stays
// deployment-agnostic and unit-testable against a fake model.
//
// Optimistic locking: the pure domain bumps `version` BEFORE save() is called,
// so save() opt-locks on { _id, version: account.version - 1 } and $sets the
// already-bumped fields. A null result means a concurrent writer moved the
// version -> CONFLICT. Brand-new accounts (version 0) are INSERTED via
// insertAcquired, never through save().
import { conflictError } from '../errors.js';

function toFields(a) {
  return {
    platform: a.platform,
    identifier: a.identifier,
    source: a.source,
    shopId: a.shopId ?? null,
    secretRefs: a.secretRefs ?? {},
    status: a.status,
    assignedDeviceId: a.assignedDeviceId ?? null,
    assignedProxyId: a.assignedProxyId ?? null,
    health: a.health,
    checkpointReason: a.checkpointReason ?? null,
    version: a.version
  };
}

export function createMongoAccountRepo({ model } = {}) {
  if (!model) throw new Error('createMongoAccountRepo requires a mongoose model');
  return {
    async find(filter = {}) {
      return model.find(filter).lean();
    },
    async countAvailable(filter = {}) {
      return model.countDocuments({ status: 'acquired', assignedDeviceId: null, ...filter });
    },
    async save(account) {
      const updated = await model.findOneAndUpdate(
        { _id: account.id, version: account.version - 1 },
        { $set: toFields(account) },
        { new: true }
      );
      if (!updated) throw conflictError(`account ${account.id} version conflict`);
      return updated;
    },
    async insertAcquired(accounts, { orderId } = {}) {
      const docs = accounts.map((a) => ({
        platform: a.platform,
        identifier: a.identifier,
        source: a.source ?? 'purchase',
        shopId: a.shopId ?? null,
        secretRefs: a.secretRefs ?? {},
        status: 'acquired',
        assignedDeviceId: null,
        version: 0,
        acquisition: { ...(a.acquisition ?? {}), externalOrderId: orderId ?? null }
      }));
      return model.insertMany(docs, { ordered: false });
    }
  };
}
