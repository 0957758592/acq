import { createFacade } from '@acq/control';

import { buildValidators } from './validators.js';

const validators = buildValidators();

function facadeWith(useCases = {}) {
  return createFacade({ useCases, validators, audit: { record: async () => {} } });
}

describe('per-operation validators (REQUIREM §2.2, reject unknown)', () => {
  it('covers every one of the 56 operations', () => {
    expect(Object.keys(validators).length).toBe(56);
  });

  it('rejects a missing required field with INVALID_ARGS', async () => {
    const f = facadeWith({ 'campaign.create': async () => ({ ok: true }) });
    const res = await f.execute('campaign.create', { role: 'operator', args: { platform: 'telegram' } }); // no actionType
    expect(res.error.code).toBe('INVALID_ARGS');
  });

  it('rejects UNKNOWN fields (noUnknown)', async () => {
    const f = facadeWith({ 'campaign.pause': async () => ({ ok: true }) });
    const res = await f.execute('campaign.pause', { role: 'operator', args: { campaignId: 'c1', evil: 1 } });
    expect(res.error.code).toBe('INVALID_ARGS');
  });

  it('rejects a wrong-typed field', async () => {
    const f = facadeWith({ 'pool.acquire': async () => ({ ok: true }) });
    const res = await f.execute('pool.acquire', { role: 'operator', args: { platform: 'telegram', quantity: 'lots' } });
    expect(res.error.code).toBe('INVALID_ARGS');
  });

  it('passes valid args through to the handler', async () => {
    const f = facadeWith({ 'campaign.create': async (args) => ({ created: args.actionType }) });
    const res = await f.execute('campaign.create', { role: 'operator', args: { platform: 'telegram', actionType: 'follow', targets: ['@t'] } });
    expect(res.data).toEqual({ created: 'follow' });
  });

  it('enforces enum constraints (scoring.subjectType)', async () => {
    const f = facadeWith({ 'scoring.score': async () => ({ score: 1 }) });
    const bad = await f.execute('scoring.score', { role: 'readonly', args: { subjectType: 'nonsense' } });
    expect(bad.error.code).toBe('INVALID_ARGS');
  });
});
