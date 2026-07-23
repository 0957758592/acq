import { warmupHandler } from './warmup.handler.js';

function fakeCtx({ account, warmupResult } = {}) {
  const warmups = [];
  return {
    warmups,
    accountRepo: {
      find: async (f) => (account && String(f._id) === account._id ? [account] : []),
      setWarmup: async (id, patch) => { warmups.push({ id, patch }); return { _id: id, warmup: patch }; }
    },
    deviceModel: { findById: (id) => ({ lean: async () => ({ _id: id, providerDeviceId: `pad-${id}` }) }) },
    automationFor: (platform) => ({ warmup: async (c) => { warmups.push(['warmup', platform, c.providerDeviceId]); return warmupResult ?? { ok: true, level: 1 }; } })
  };
}

describe('warmupHandler (generic, any platform)', () => {
  it('runs the driver warmup on the assigned device and records the new warmup level', async () => {
    const ctx = fakeCtx({ account: { _id: 'a1', platform: 'instagram', assignedDeviceId: 'd1' } });
    const res = await warmupHandler(ctx, { accountId: 'a1', deviceId: 'd1' });
    expect(res).toMatchObject({ ok: true, level: 1 });
    expect(ctx.warmups.some((w) => Array.isArray(w) && w[0] === 'warmup' && w[2] === 'pad-d1')).toBe(true);
    expect(ctx.warmups.some((w) => w.patch && w.patch.level === 1)).toBe(true);
  });

  it('fails safe when the account is missing', async () => {
    const ctx = fakeCtx({});
    const res = await warmupHandler(ctx, { accountId: 'nope', deviceId: 'd1' });
    expect(res).toMatchObject({ ok: false, reason: 'account-not-found' });
  });

  it('fails safe (blocked) when no device provider is wired', async () => {
    const ctx = fakeCtx({ account: { _id: 'a1', platform: 'instagram', assignedDeviceId: 'd1' } });
    ctx.automationFor = null;
    const res = await warmupHandler(ctx, { accountId: 'a1', deviceId: 'd1' });
    expect(res).toMatchObject({ ok: false, blocked: 'AUTOMATION_UNAVAILABLE' });
  });
});
