// Email identity store (TZ §6.4). CRUD over operator-owned mailboxes used for
// shop signup/confirmation. Secrets are REFS only; reads always strip them so no
// surface (or the brain) can ever see credential material.
function strip(doc) {
  if (!doc) return null;
  return {
    address: doc.address,
    provider: doc.provider ?? 'custom',
    // Email TYPE (free-form label): standard / aged / us / manual / disposable /
    // autoreg-purchased / … — so operators can pick a mailbox by type.
    category: doc.category ?? 'standard',
    imapHost: doc.imapHost ?? '',
    imapPort: doc.imapPort ?? 993,
    status: doc.status ?? 'active',
    notes: doc.notes ?? '',
    hasPasswordRef: Boolean(doc.secretRefs?.password)
  };
}

export function createEmailIdentityStore({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createEmailIdentityStore requires a model');
  return {
    async register({ address, provider = 'custom', category = 'standard', imapHost = '', imapPort = 993, passwordRef, notes = '' }) {
      if (!address) throw Object.assign(new Error('EMAIL_ADDRESS_REQUIRED: address is required'), { code: 'EMAIL_ADDRESS_REQUIRED' });
      if (!passwordRef) throw Object.assign(new Error('EMAIL_PASSWORD_REF_REQUIRED: a secret ref is required (never a plaintext password)'), { code: 'EMAIL_PASSWORD_REF_REQUIRED' });
      const doc = await model.findOneAndUpdate(
        { tenantId, address },
        { $set: { provider, category, imapHost, imapPort, notes, secretRefs: { password: passwordRef }, status: 'active' }, $setOnInsert: { tenantId, address } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return strip(doc);
    },
    async get(address) {
      return strip(await model.findOne({ tenantId, address }).lean());
    },
    async list({ category = null } = {}) {
      const filter = { tenantId, ...(category ? { category } : {}) };
      return (await model.find(filter).lean()).map(strip);
    },
    async disable(address) {
      const doc = await model.findOneAndUpdate({ tenantId, address }, { $set: { status: 'disabled' } }, { new: true });
      return strip(doc);
    },
    // Internal: the credentials an IMAP/signup call needs (refs, still not values).
    async credentialsFor(address) {
      const doc = await model.findOne({ tenantId, address }).lean();
      if (!doc) throw Object.assign(new Error(`EMAIL_IDENTITY_NOT_FOUND: ${address}`), { code: 'EMAIL_IDENTITY_NOT_FOUND' });
      if (doc.status !== 'active') throw Object.assign(new Error(`EMAIL_IDENTITY_DISABLED: ${address}`), { code: 'EMAIL_IDENTITY_DISABLED' });
      return { address: doc.address, passwordRef: doc.secretRefs?.password ?? null, imapHost: doc.imapHost || '', imapPort: doc.imapPort ?? 993, provider: doc.provider ?? 'custom' };
    }
  };
}
