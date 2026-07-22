import { createMongoAuditLog, redactSecrets } from './mongo-audit-log.js';

describe('redactSecrets', () => {
  test('redacts sensitive keys at any depth', () => {
    const out = redactSecrets({ token: 'abc', nested: { password: 'p', ok: 1 }, session: 's' });
    expect(out).toEqual({ token: '[REDACTED]', nested: { password: '[REDACTED]', ok: 1 }, session: '[REDACTED]' });
  });
});

describe('createMongoAuditLog', () => {
  test('record inserts an append-only entry with redacted args', async () => {
    const inserted = [];
    const model = { create: async (e) => { inserted.push(e); return e; } };
    const audit = createMongoAuditLog({ model });
    await audit.record({ operation: 'account.retire', actor: 'u1', role: 'admin', args: { accountId: 'a1', token: 'x' } });
    expect(inserted[0]).toMatchObject({ operation: 'account.retire', actor: 'u1' });
    expect(inserted[0].args).toEqual({ accountId: 'a1', token: '[REDACTED]' });
  });
});
