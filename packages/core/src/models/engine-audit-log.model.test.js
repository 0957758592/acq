import { EngineAuditLog } from './engine-audit-log.model.js';

describe('EngineAuditLog model', () => {
  it('validates clean with an operation and defaults tenantId + at', () => {
    const doc = new EngineAuditLog({ operation: 'account.retire', actor: 'u1', role: 'admin' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.tenantId).toBe('default');
    expect(doc.at).toBeInstanceOf(Date);
  });

  it('requires an operation', () => {
    expect(new EngineAuditLog({}).validateSync()).toBeDefined();
  });

  it('blocks updates (append-only) via a pre-hook', () => {
    // The updateOne pre-hook rejects; assert the hook is registered.
    const hooks = EngineAuditLog.schema.s?.hooks;
    expect(EngineAuditLog.schema.pre).toBeDefined();
    // Behavioural: a static updateOne call rejects.
    return expect(EngineAuditLog.updateOne({ _id: 'x' }, { $set: { actor: 'z' } })).rejects.toThrow(
      'append-only'
    );
  });
});
