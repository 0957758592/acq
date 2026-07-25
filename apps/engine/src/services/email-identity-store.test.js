import { createEmailIdentityStore } from './email-identity-store.js';

function fakeModel() {
  const rows = new Map();
  return {
    findOne: (f) => ({ lean: async () => rows.get(f.address) ?? null }),
    find: () => ({ lean: async () => [...rows.values()] }),
    findOneAndUpdate: async (f, u) => {
      const merged = { ...(rows.get(f.address) || {}), address: f.address, ...(u.$set || {}), ...(u.$setOnInsert || {}) };
      rows.set(f.address, merged);
      return merged;
    }
  };
}

describe('createEmailIdentityStore (operator-owned mailboxes, any provider)', () => {
  it('registers an identity with a SECRET REF and never exposes credentials on read', async () => {
    const store = createEmailIdentityStore({ model: fakeModel() });
    const saved = await store.register({ address: 'ops@gmail.com', provider: 'gmail', passwordRef: 'vault:mail-pw' });
    expect(saved).toMatchObject({ address: 'ops@gmail.com', provider: 'gmail', hasPasswordRef: true });
    expect(JSON.stringify(saved)).not.toContain('vault:mail-pw');
    expect(await store.get('ops@gmail.com')).toMatchObject({ hasPasswordRef: true });
  });

  it('supports ANY provider incl. a custom IMAP host/port (not gmail-only)', async () => {
    const store = createEmailIdentityStore({ model: fakeModel() });
    await store.register({ address: 'a@corp.tld', provider: 'custom', imapHost: 'imap.corp.tld', imapPort: 1993, passwordRef: 'env:CORP_PW' });
    expect(await store.get('a@corp.tld')).toMatchObject({ provider: 'custom', imapHost: 'imap.corp.tld', imapPort: 1993 });
  });

  it('rejects a plaintext password (refs only) and a missing address', async () => {
    const store = createEmailIdentityStore({ model: fakeModel() });
    await expect(store.register({ address: 'x@y.z' })).rejects.toMatchObject({ code: 'EMAIL_PASSWORD_REF_REQUIRED' });
    await expect(store.register({ passwordRef: 'vault:p' })).rejects.toMatchObject({ code: 'EMAIL_ADDRESS_REQUIRED' });
  });

  it('credentialsFor returns the refs for signup/IMAP, and fails safe on unknown/disabled', async () => {
    const store = createEmailIdentityStore({ model: fakeModel() });
    await store.register({ address: 'ops@gmail.com', provider: 'gmail', passwordRef: 'vault:pw' });
    expect(await store.credentialsFor('ops@gmail.com')).toMatchObject({ passwordRef: 'vault:pw', provider: 'gmail' });
    await expect(store.credentialsFor('nope@x.y')).rejects.toMatchObject({ code: 'EMAIL_IDENTITY_NOT_FOUND' });
    await store.disable('ops@gmail.com');
    await expect(store.credentialsFor('ops@gmail.com')).rejects.toMatchObject({ code: 'EMAIL_IDENTITY_DISABLED' });
  });

  it('lists identities with secrets stripped', async () => {
    const store = createEmailIdentityStore({ model: fakeModel() });
    await store.register({ address: 'a@x.y', passwordRef: 'vault:1' });
    await store.register({ address: 'b@x.y', passwordRef: 'vault:2' });
    const list = await store.list();
    expect(list.map((i) => i.address).sort()).toEqual(['a@x.y', 'b@x.y']);
    expect(JSON.stringify(list)).not.toContain('vault:');
  });
});
