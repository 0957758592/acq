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
