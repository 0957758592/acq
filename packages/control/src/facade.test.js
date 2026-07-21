import { createFacade } from './facade.js';
import { domainError } from '@acq/engine-domain';

function build(overrides = {}) {
  const audits = [];
  const facade = createFacade({
    useCases: {
      'pool.status': async () => ({ available: 7 }),
      'account.retire': async ({ accountId }) => ({ retired: accountId }),
      'campaign.create': async () => {
        throw domainError('ACCOUNT_TRANSITION_INVALID', 'bad move');
      },
      ...overrides.useCases
    },
    audit: { record: async (entry) => audits.push(entry) }
  });
  return { facade, audits };
}

describe('createFacade.execute — envelope', () => {
  test('returns { data, error:null, meta } on success', async () => {
    const { facade } = build();
    const res = await facade.execute('pool.status', { role: 'readonly', correlationId: 'c1' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ available: 7 });
    expect(res.meta).toMatchObject({ operation: 'pool.status', correlationId: 'c1' });
  });

  test('unknown operation -> UNKNOWN_OPERATION error envelope', async () => {
    const { facade } = build();
    const res = await facade.execute('ghost.op', { role: 'admin' });
    expect(res.data).toBeNull();
    expect(res.error.code).toBe('UNKNOWN_OPERATION');
  });

  test('forbidden role -> FORBIDDEN, use-case not called', async () => {
    let called = false;
    const { facade } = build({ useCases: { 'account.retire': async () => { called = true; return {}; } } });
    const res = await facade.execute('account.retire', { role: 'readonly', args: { accountId: 'a1' } });
    expect(res.error.code).toBe('FORBIDDEN');
    expect(called).toBe(false);
  });

  test('maps a thrown DomainError to a clean error envelope (no stack)', async () => {
    const { facade } = build();
    const res = await facade.execute('campaign.create', { role: 'operator', args: {} });
    expect(res.error).toEqual({ code: 'ACCOUNT_TRANSITION_INVALID', message: expect.any(String) });
    expect(res.error.stack).toBeUndefined();
  });
});

describe('createFacade.execute — audit', () => {
  test('records an audit entry for a mutating op', async () => {
    const { facade, audits } = build();
    await facade.execute('account.retire', { role: 'operator', args: { accountId: 'a1' }, actor: 'u1' });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ operation: 'account.retire', actor: 'u1', role: 'operator' });
  });

  test('does not audit a read-only op', async () => {
    const { facade, audits } = build();
    await facade.execute('pool.status', { role: 'readonly' });
    expect(audits).toHaveLength(0);
  });
});
