import { probeAccount, runAccountAction } from './account-ops.js';

function fakeCtx({ account, probe, action } = {}) {
  const calls = [];
  return {
    calls,
    accountRepo: { find: async (f) => (account && String(f._id) === account._id ? [account] : []) },
    deviceModel: { findById: (id) => ({ lean: async () => ({ _id: id, providerDeviceId: `pad-${id}` }) }) },
    automationFor: (platform) => ({
      probeState: async (ctx) => { calls.push(['probe', platform, ctx.providerDeviceId]); return probe ?? 'online'; },
      runAction: async (ctx, act) => { calls.push(['action', platform, ctx.providerDeviceId, act.type, act.target]); return action ?? { ok: true }; }
    })
  };
}

describe('account-ops service (generic device ops over the facade)', () => {
  it('probeAccount resolves the device and returns the real on-device state', async () => {
    const ctx = fakeCtx({ account: { _id: 'a1', platform: 'instagram', assignedDeviceId: 'd1' }, probe: 'logged_out' });
    const res = await probeAccount(ctx, { accountId: 'a1' });
    expect(res).toMatchObject({ accountId: 'a1', platform: 'instagram', state: 'logged_out' });
    expect(ctx.calls[0]).toEqual(['probe', 'instagram', 'pad-d1']);
  });

  it('runAccountAction drives the action on the assigned device (verify-by-fact result)', async () => {
    const ctx = fakeCtx({ account: { _id: 'a1', platform: 'telegram', assignedDeviceId: 'd1' }, action: { ok: false, reason: 'ACTION_NOT_CONFIRMED' } });
    const res = await runAccountAction(ctx, { accountId: 'a1', actionType: 'view', target: '@t' });
    expect(res).toMatchObject({ accountId: 'a1', actionType: 'view', target: '@t', ok: false, reason: 'ACTION_NOT_CONFIRMED' });
    expect(ctx.calls[0]).toEqual(['action', 'telegram', 'pad-d1', 'view', '@t']);
  });

  it('runAccountAction rejects an action the platform does not support (coded, before touching the device)', async () => {
    // instagram supports publish/follow/like/comment/dm — NOT report.
    const ctx = fakeCtx({ account: { _id: 'a1', platform: 'instagram', assignedDeviceId: 'd1' } });
    await expect(runAccountAction(ctx, { accountId: 'a1', actionType: 'report', target: '@t' }))
      .rejects.toMatchObject({ code: 'ACTION_NOT_SUPPORTED' });
    // never dispatched to the device
    expect(ctx.calls.find((c) => c[0] === 'action')).toBeUndefined();
  });

  it('runAccountAction rejects an unsupported action even with no device provider wired (input validation precedes infra)', async () => {
    const ctx = fakeCtx({ account: { _id: 'a1', platform: 'instagram', assignedDeviceId: 'd1' } });
    ctx.automationFor = null; // no provider
    await expect(runAccountAction(ctx, { accountId: 'a1', actionType: 'report', target: '@t' }))
      .rejects.toMatchObject({ code: 'ACTION_NOT_SUPPORTED' });
  });

  it('both fail safe when the account is missing', async () => {
    const ctx = fakeCtx({});
    await expect(probeAccount(ctx, { accountId: 'nope' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
    await expect(runAccountAction(ctx, { accountId: 'nope', actionType: 'view', target: '@t' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
  });

  it('fail safe with AUTOMATION_UNAVAILABLE when no device provider is wired', async () => {
    const ctx = fakeCtx({ account: { _id: 'a1', platform: 'telegram', assignedDeviceId: 'd1' } });
    ctx.automationFor = null;
    await expect(probeAccount(ctx, { accountId: 'a1' })).rejects.toMatchObject({ code: 'AUTOMATION_UNAVAILABLE' });
  });
});
