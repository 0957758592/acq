import { bringOnlineHandler } from './bring-online.handler.js';

const clock = { now: () => new Date('2026-07-22T16:00:00.000Z') };

function fakeCtx({ account, bringOnlineResult, bringOnlineThrows, device = { providerDeviceId: 'pd1' } } = {}) {
  const saved = [];
  const events = [];
  const released = [];
  return {
    saved,
    events,
    released,
    clock,
    owner: 'engine:test',
    lease: { claim: async () => true, release: async (d) => released.push(d) },
    accountRepo: {
      find: async () => [account],
      save: async (a) => { saved.push({ status: a.status, version: a.version }); return a; }
    },
    deviceModel: { findById: () => ({ lean: async () => device }) },
    automationFor: () => ({
      bringOnline: async () => {
        if (bringOnlineThrows) throw Object.assign(new Error(bringOnlineThrows), { code: bringOnlineThrows });
        return bringOnlineResult;
      }
    }),
    eventBus: { publish: async (e) => events.push(e.type) }
  };
}

const account = (over = {}) => ({
  _id: 'a1', platform: 'telegram', identifier: '@t1', status: 'assigned', assignedDeviceId: 'd1',
  secretRefs: {}, health: { consecutiveFailures: 0, lastProbeAt: null }, version: 1, ...over
});

const payload = { accountId: 'a1', deviceId: 'd1', platform: 'telegram' };

describe('generic bringOnlineHandler', () => {
  it('proxyMode required (default): blocks login when the device has NO proxy — never a bare-IP login', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineResult: { ok: true } });
    ctx.provider = { getDeviceProxy: async () => null }; // device not behind a proxy
    const res = await bringOnlineHandler(ctx, payload);
    expect(res).toMatchObject({ ok: false, blocked: 'PROXY_REQUIRED' });
    expect(ctx.saved.map((s) => s.status)).toEqual(['bringing_online', 'assigned']); // reverted, not online
  });

  it('no device automation wired (no device provider) -> honest coded seam, reverts to assigned, never a raw crash', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineResult: { ok: true } });
    ctx.provider = { getDeviceProxy: async () => ({ id: 'p', ip: '1.2.3.4', country: 'us' }) }; // pass the proxy gate
    ctx.automationFor = null; // no device provider -> automationFor is null
    const res = await bringOnlineHandler(ctx, payload);
    expect(res).toMatchObject({ ok: false, blocked: 'AUTOMATION_UNAVAILABLE' });
    expect(ctx.saved.map((s) => s.status)).toContain('assigned'); // reverted, not faked online
  });

  it('proxyMode required: proceeds to login when the device IS behind a proxy', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineResult: { ok: true } });
    ctx.provider = { getDeviceProxy: async () => ({ id: 'yn5LN', ip: '9.142.42.60', country: 'us' }) };
    const res = await bringOnlineHandler(ctx, payload);
    expect(res.ok).toBe(true);
    expect(ctx.events).toContain('account.online');
  });

  it('proxyMode "off" (per-job override): logs in even without a device proxy', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineResult: { ok: true } });
    ctx.provider = { getDeviceProxy: async () => null };
    const res = await bringOnlineHandler(ctx, { ...payload, proxyMode: 'off' });
    expect(res.ok).toBe(true);
  });

  it('a login-runner verify seam (LOGIN_SCREEN_UNVERIFIED) fails safe: revert to assigned, blocked — not stuck', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineThrows: 'LINKEDIN_LOGIN_SCREEN_UNVERIFIED' });
    const res = await bringOnlineHandler(ctx, { ...payload, platform: 'linkedin' });
    expect(res).toMatchObject({ ok: false, blocked: 'LINKEDIN_LOGIN_SCREEN_UNVERIFIED' });
    expect(ctx.saved.map((s) => s.status)).toEqual(['bringing_online', 'assigned']); // reverted, never stuck
  });

  it('brings an account online across the state machine and emits account.online', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineResult: { ok: true } });
    const res = await bringOnlineHandler(ctx, payload);
    expect(res.ok).toBe(true);
    // bringing_online then online
    expect(ctx.saved.map((s) => s.status)).toEqual(['bringing_online', 'online']);
    expect(ctx.events).toContain('account.online');
    expect(ctx.released).toContain('d1');
  });

  it('reverts to assigned + blocked on a session-import seam (no fake success)', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineThrows: 'TELEGRAM_SESSION_IMPORT_UNVERIFIED' });
    const res = await bringOnlineHandler(ctx, payload);
    expect(res).toMatchObject({ ok: false, blocked: 'TELEGRAM_SESSION_IMPORT_UNVERIFIED' });
    expect(ctx.saved.map((s) => s.status)).toEqual(['bringing_online', 'assigned']);
  });

  it('maps a mid-flow ban to banned + account.banned', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineResult: { ok: false, banned: true } });
    const res = await bringOnlineHandler(ctx, payload);
    expect(res.banned).toBe(true);
    expect(ctx.saved.map((s) => s.status)).toContain('banned');
    expect(ctx.events).toContain('account.banned');
  });

  it('maps checkpoint to checkpointed', async () => {
    const ctx = fakeCtx({ account: account(), bringOnlineResult: { ok: false, checkpointed: true } });
    const res = await bringOnlineHandler(ctx, payload);
    expect(res.checkpointed).toBe(true);
    expect(ctx.saved.map((s) => s.status)).toContain('checkpointed');
    expect(ctx.events).toContain('account.checkpointed');
  });

  it('DEVICE_BUSY when the lease cannot be claimed (retriable)', async () => {
    const ctx = fakeCtx({ account: account() });
    ctx.lease.claim = async () => false;
    await expect(bringOnlineHandler(ctx, payload)).rejects.toMatchObject({ code: 'DEVICE_BUSY' });
  });
});
