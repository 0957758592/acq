// MCP read-only resources.
//
// buildResources(ctx) returns { list(), read(uri) }. `read` returns a plain JSON object
// (the transport core serializes it). Account projections are SECRET-STRIPPED: publicAccount
// deliberately omits `secretRefs` so keychain handles never cross the MCP boundary.
//
// Static resources (enumerated by list()): whatsapp://pool/summary, whatsapp://devices.
// Templated, read-only-by-id resources (documented, NOT enumerated):
//   whatsapp://campaigns/{id}, whatsapp://accounts/{id}.
import { domainError } from '@acq/whatsapp';

const STATIC_RESOURCES = [
  { uri: 'whatsapp://pool/summary', name: 'Pool summary', mimeType: 'application/json' },
  { uri: 'whatsapp://devices', name: 'Devices', mimeType: 'application/json' }
];

// SECRET-STRIPPED account projection — never includes secretRefs.
export function publicAccount(doc) {
  return {
    id: String(doc._id),
    msisdn: doc.msisdn,
    source: doc.source,
    status: doc.status,
    assignedDeviceId: doc.assignedDeviceId != null ? String(doc.assignedDeviceId) : null,
    health: doc.health,
    version: doc.version
  };
}

export function publicDevice(q) {
  return {
    deviceId: String(q.deviceId),
    activeSlots: q.activeSlots,
    targetDepth: q.targetDepth,
    activeAccountIds: (q.activeAccountIds || []).map(String),
    waitingAccountIds: (q.waitingAccountIds || []).map(String),
    version: q.version
  };
}

// A malformed id (e.g. non-24-hex) makes Mongoose throw a CastError while casting
// the query. That is a client mistake, not an infra failure, so translate it to
// NOT_FOUND (→ InvalidParams) instead of letting it collapse to a generic InternalError.
async function loadOrCastNotFound(load, id) {
  try {
    return await load();
  } catch (err) {
    if (err?.name === 'CastError') throw domainError('NOT_FOUND', `invalid or unknown id: ${id}`);
    throw err;
  }
}

export function buildResources(ctx) {
  async function read(uri) {
    if (uri === 'whatsapp://pool/summary') {
      return {
        available: await ctx.accountRepo.countAvailable(),
        threshold: ctx.config.poolThreshold,
        autobuyEnabled: ctx.config.autobuyEnabled
      };
    }
    if (uri === 'whatsapp://devices') {
      return (await ctx.deviceQueueRepo.listAll()).map(publicDevice);
    }

    const campaignMatch = /^whatsapp:\/\/campaigns\/(.+)$/.exec(uri);
    if (campaignMatch) {
      const id = campaignMatch[1];
      const campaign = await loadOrCastNotFound(() => ctx.reportRepo.findCampaign(id), id);
      if (!campaign) throw domainError('NOT_FOUND', `unknown campaign ${id}`);
      return campaign;
    }

    const accountMatch = /^whatsapp:\/\/accounts\/(.+)$/.exec(uri);
    if (accountMatch) {
      const id = accountMatch[1];
      const [doc] = await loadOrCastNotFound(() => ctx.accountRepo.find({ _id: id }), id);
      if (!doc) throw domainError('NOT_FOUND', `unknown account ${id}`);
      return publicAccount(doc);
    }

    throw domainError('NOT_FOUND', `unknown resource ${uri}`);
  }

  return {
    list: () => STATIC_RESOURCES,
    read
  };
}
