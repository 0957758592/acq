import { applyAccountTransition, reassignAccount } from './account-lifecycle.js';

const clock = { now: () => new Date('2026-07-22T18:00:00.000Z') };

function fakeCtx(doc) {
  const saved = [];
  return {
    saved,
    clock,
    accountRepo: {
      find: async (f) => (String(f._id) === String(doc?._id) ? [doc] : []),
      save: async (a) => { saved.push(a); return a; }
    }
  };
}

describe('account-lifecycle service (shared, generic)', () => {
  it('applyAccountTransition walks the state machine and persists with opt-lock version bump', async () => {
    const ctx = fakeCtx({ _id: 'a1', platform: 'telegram', identifier: '@x', source: 'purchase', status: 'online', assignedDeviceId: 'd1', version: 4 });
    const res = await applyAccountTransition(ctx, { accountId: 'a1', to: 'cooldown' });
    expect(res).toMatchObject({ accountId: 'a1', status: 'cooldown' });
    expect(ctx.saved[0].status).toBe('cooldown');
    expect(ctx.saved[0].version).toBe(5);
  });

  it('applyAccountTransition rejects an illegal transition (coded)', async () => {
    const ctx = fakeCtx({ _id: 'a1', platform: 'telegram', identifier: '@x', source: 'purchase', status: 'banned', version: 1 });
    await expect(applyAccountTransition(ctx, { accountId: 'a1', to: 'online' })).rejects.toMatchObject({ code: 'ACCOUNT_TRANSITION_INVALID' });
  });

  it('applyAccountTransition fails safe when the account is missing', async () => {
    const ctx = fakeCtx({ _id: 'a1', status: 'online', version: 1 });
    await expect(applyAccountTransition(ctx, { accountId: 'missing', to: 'cooldown' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
  });

  it('reassignAccount sets the assigned device and bumps version', async () => {
    const ctx = fakeCtx({ _id: 'a1', platform: 'telegram', identifier: '@x', source: 'purchase', status: 'assigned', assignedDeviceId: 'd1', version: 2 });
    const res = await reassignAccount(ctx, { accountId: 'a1', deviceId: 'd2' });
    expect(res).toMatchObject({ accountId: 'a1', assignedDeviceId: 'd2' });
    expect(ctx.saved[0].assignedDeviceId).toBe('d2');
    expect(ctx.saved[0].version).toBe(3);
  });
});
