// Generic MongoAccountRepo — persistence for EngineAccount, generalized from
// the whatsapp vertical (TZ §4). The mongoose model is INJECTED so this stays
// deployment-agnostic and unit-testable against a fake model.
//
// Multi-tenancy (TZ §12.2/§14.2): the repo is bound to a `tenantId` and injects
// it into EVERY query and insert, so one tenant can never read/write another's
// data.
//
// Optimistic locking: the pure domain bumps `version` BEFORE save() is called,
// so save() opt-locks on { _id, tenantId, version-1 } and $sets the already-
// bumped fields. A null result means a concurrent writer moved the version ->
// CONFLICT. Brand-new accounts (version 0) are INSERTED via insertAcquired.
import { paginate } from '@acq/core/db/paginate';

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

export function createMongoAccountRepo({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createMongoAccountRepo requires a mongoose model');
  return {
    // Cursor-paginated inventory read (REQUIREM §2.5) — never loads the whole
    // collection. Tenant-scoped like every other query.
    async page(filter = {}, { cursor = null, limit } = {}) {
      return paginate(model, { tenantId, ...filter }, { cursor, limit });
    },
    async find(filter = {}) {
      try {
        return await model.find({ tenantId, ...filter }).lean();
      } catch (err) {
        // A malformed id/value can't match any row — resolve to "no rows" so
        // callers surface a coded NOT_FOUND rather than leaking a CastError.
        if (err?.name === 'CastError') return [];
        throw err;
      }
    },
    async countAvailable(filter = {}) {
      return model.countDocuments({ tenantId, status: 'acquired', assignedDeviceId: null, ...filter });
    },
    async setWarmup(accountId, { level, stage, updatedAt } = {}) {
      return model.findOneAndUpdate(
        { _id: accountId, tenantId },
        { $set: { 'warmup.level': level, 'warmup.stage': stage ?? '', 'warmup.updatedAt': updatedAt ?? new Date() } },
        { new: true }
      ).lean();
    },
    async tag(accountId, { add = [], remove = [] } = {}) {
      const ops = {};
      if (add.length) ops.$addToSet = { tags: { $each: add } };
      if (remove.length) ops.$pull = { tags: { $in: remove } };
      if (!ops.$addToSet && !ops.$pull) return model.findOne({ _id: accountId, tenantId }).lean();
      return model.findOneAndUpdate({ _id: accountId, tenantId }, ops, { new: true }).lean();
    },
    async save(account) {
      const updated = await model.findOneAndUpdate(
        { _id: account.id, tenantId, version: account.version - 1 },
        { $set: toFields(account) },
        { new: true }
      );
      if (!updated) throw conflictError(`account ${account.id} version conflict`);
      return updated;
    },
    async insertAcquired(accounts, { orderId } = {}) {
      const docs = accounts.map((a) => ({
        tenantId,
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
