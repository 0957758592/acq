// MongoAccountRepo — persistence port for whatsapp_accounts.
//
// Optimistic locking contract:
//   The pure domain (@acq/whatsapp) bumps `version` in its own functions
//   BEFORE this repo is called. So save() opt-locks on the PRE-bump value:
//   it matches { _id, version: account.version - 1 } and $set's the fields
//   INCLUDING the already-bumped `account.version`. A null result means a
//   concurrent writer moved the version → we throw conflictError.
//
//   Brand-new accounts (version 0) are INSERTED elsewhere (procurement,
//   Plan 3), never through save() — save() only ever updates an existing row.
import { WhatsappAccount } from '../models/whatsapp-account.model.js';
import { conflictError } from '../errors.js';

function toFields(a) {
  return {
    msisdn: a.msisdn, source: a.source, secretRefs: a.secretRefs,
    status: a.status, assignedDeviceId: a.assignedDeviceId,
    health: a.health, version: a.version
  };
}

export function createMongoAccountRepo({ model = WhatsappAccount } = {}) {
  return {
    async find(filter = {}) { return model.find(filter).lean(); },
    async countAvailable(filter = {}) {
      return model.countDocuments({ status: 'purchased', assignedDeviceId: null, ...filter });
    },
    async save(account) {
      const previousVersion = account.version - 1; // domain already bumped
      const updated = await model.findOneAndUpdate(
        { _id: account.id, version: previousVersion },
        { $set: toFields(account) },
        { new: true }
      );
      if (!updated) throw conflictError(`account ${account.id} version conflict`);
      return updated;
    },
    async insertPurchased(accounts, { orderId } = {}) {
      const docs = accounts.map((a) => ({
        msisdn: a.msisdn,
        source: a.source,
        secretRefs: a.secretRefs ?? {},
        status: 'purchased',
        assignedDeviceId: null,
        version: 0,
        metadata: { ...(a.metadata ?? {}), orderId }
      }));
      return model.insertMany(docs, { ordered: false });
    }
  };
}
