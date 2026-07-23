import { EngineAccount, ACCOUNT_STATUSES } from './engine-account.model.js';

describe('EngineAccount model', () => {
  it('validates clean with platform + identifier and applies defaults', () => {
    const doc = new EngineAccount({ platform: 'telegram', identifier: '@bob' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.tenantId).toBe('default');
    expect(doc.status).toBe('acquired');
    expect(doc.version).toBe(0);
    expect(doc.source).toBe('purchase');
  });

  it('requires platform and identifier', () => {
    expect(new EngineAccount({}).validateSync()).toBeDefined();
  });

  it('persists top-level secretRefs (session-import refs from a purchased account)', () => {
    // The procurement → insertAcquired → bringOnline pipeline stores/reads
    // vaulted secrets under a top-level `secretRefs`. Without the field, strict
    // mode silently drops it and a purchased account loses its session.
    const doc = new EngineAccount({ platform: 'telegram', identifier: '+15551230001', secretRefs: { session: 'vault:session:s1' } });
    expect(doc.secretRefs).toEqual({ session: 'vault:session:s1' });
  });

  it('persists top-level secretRefs (session-import refs from a purchased account)', () => {
    // The procurement → insertAcquired → bringOnline pipeline stores/reads
    // vaulted secrets under a top-level `secretRefs`. Without the field, strict
    // mode silently drops it and a purchased account loses its session.
    const doc = new EngineAccount({ platform: 'telegram', identifier: '+15551230001', secretRefs: { session: 'vault:session:s1' } });
    expect(doc.secretRefs).toEqual({ session: 'vault:session:s1' });
  });

  it('rejects a status outside the 8-state machine', () => {
    const doc = new EngineAccount({ platform: 'telegram', identifier: '@x', status: 'zombie' });
    expect(doc.validateSync()).toBeDefined();
  });

  it('exposes the 8 canonical statuses', () => {
    expect(ACCOUNT_STATUSES).toEqual([
      'acquired', 'assigned', 'bringing_online', 'online',
      'cooldown', 'checkpointed', 'banned', 'retired'
    ]);
  });

  it('enforces a unique index on {tenantId, platform, identifier}', () => {
    const unique = EngineAccount.schema
      .indexes()
      .some(([f, o]) => f.tenantId === 1 && f.platform === 1 && f.identifier === 1 && o?.unique);
    expect(unique).toBe(true);
  });
});
