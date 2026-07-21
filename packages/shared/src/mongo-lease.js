function buildLeaseDate(ttlMs) {
  return new Date(Date.now() + Math.max(Number(ttlMs) || 0, 1));
}

function normalizeLeaseOwner(owner) {
  const value = String(owner || '').trim();
  if (!value) throw new Error('Lease owner is required');
  return value;
}

export async function claimMongoLease(
  model,
  {
    owner,
    ttlMs = 10 * 60 * 1000,
    filter = {},
    sort = { leasedUntil: 1, updatedAt: 1 },
    leaseUntilField = 'leasedUntil',
    leaseOwnerField = 'leasedBy'
  } = {}
) {
  if (!model?.findOneAndUpdate) throw new Error('A Mongoose model is required');
  const now = new Date();
  const leaseOwner = normalizeLeaseOwner(owner);

  return model.findOneAndUpdate(
    {
      ...filter,
      $or: [
        { [leaseUntilField]: null },
        { [leaseUntilField]: { $exists: false } },
        { [leaseUntilField]: { $lt: now } }
      ]
    },
    {
      $set: {
        [leaseUntilField]: buildLeaseDate(ttlMs),
        [leaseOwnerField]: leaseOwner
      }
    },
    { new: true, sort }
  );
}

export async function renewMongoLease(
  model,
  documentId,
  {
    owner,
    ttlMs = 10 * 60 * 1000,
    leaseUntilField = 'leasedUntil',
    leaseOwnerField = 'leasedBy'
  } = {}
) {
  if (!model?.findOneAndUpdate) throw new Error('A Mongoose model is required');
  const leaseOwner = normalizeLeaseOwner(owner);

  return model.findOneAndUpdate(
    { _id: documentId, [leaseOwnerField]: leaseOwner },
    { $set: { [leaseUntilField]: buildLeaseDate(ttlMs) } },
    { new: true }
  );
}

export async function releaseMongoLease(
  model,
  documentId,
  { owner, leaseUntilField = 'leasedUntil', leaseOwnerField = 'leasedBy' } = {}
) {
  if (!model?.findOneAndUpdate) throw new Error('A Mongoose model is required');
  const filter = { _id: documentId };
  if (owner) filter[leaseOwnerField] = normalizeLeaseOwner(owner);

  return model.findOneAndUpdate(
    filter,
    {
      $set: { [leaseUntilField]: null },
      $unset: { [leaseOwnerField]: '' }
    },
    { new: true }
  );
}

export async function releaseLeasesByOwner(
  model,
  { owner, leaseUntilField = 'leasedUntil', leaseOwnerField = 'leasedBy' } = {}
) {
  if (!model?.updateMany) throw new Error('A Mongoose model is required');
  const leaseOwner = normalizeLeaseOwner(owner);

  return model.updateMany(
    { [leaseOwnerField]: leaseOwner },
    {
      $set: { [leaseUntilField]: null },
      $unset: { [leaseOwnerField]: '' }
    }
  );
}
