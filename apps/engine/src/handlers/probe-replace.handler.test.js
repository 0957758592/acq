import { probeHealthHandler } from './probe-health.handler.js';
import { replaceBannedHandler } from './replace-banned.handler.js';

const clock = { now: () => new Date('2026-07-22T16:30:00.000Z') };
const account = (over = {}) => ({
  _id: 'a1', platform: 'telegram', identifier: '@t1', status: 'online', assignedDeviceId: 'd1',
  secretRefs: {}, health: { consecutiveFailures: 0, lastProbeAt: null }, version: 3, ...over
});

function probeCtx(state) {
  const saved = [];
  const events = [];
  return {
    saved,
    events,
    clock,
    owner: 'engine:test',
    lease: { claim: async () => true, release: async () => {} },
    accountRepo: { find: async () => [account()], save: async (a) => saved.push(a.status) },
    deviceModel: { findById: () => ({ lean: async () => ({ providerDeviceId: 'pd1' }) }) },
    automationFor: () => ({ probeState: async () => state }),
    eventBus: { publish: async (e) => events.push(e.type) }
  };
}

describe('generic probeHealthHandler', () => {
  it('online -> healthy', async () => {
    const ctx = probeCtx('online');
    const res = await probeHealthHandler(ctx, { accountId: 'a1', deviceId: 'd1', platform: 'telegram' });
    expect(res).toMatchObject({ ok: true, state: 'online' });
  });
  it('banned -> transitions banned + emits event', async () => {
    const ctx = probeCtx('banned');
    const res = await probeHealthHandler(ctx, { accountId: 'a1', deviceId: 'd1', platform: 'telegram' });
    expect(res.banned).toBe(true);
    expect(ctx.saved).toContain('banned');
    expect(ctx.events).toContain('account.banned');
  });
  it('logged_out -> re-login (bringing_online)', async () => {
    const ctx = probeCtx('logged_out');
    const res = await probeHealthHandler(ctx, { accountId: 'a1', deviceId: 'd1', platform: 'telegram' });
    expect(res.relogin).toBe(true);
    expect(ctx.saved).toContain('bringing_online');
  });
});

describe('generic replaceBannedHandler', () => {
  function replaceCtx({ acct, queueDoc }) {
    const savedQueues = [];
    const events = [];
    return {
      savedQueues,
      events,
      clock,
      accountRepo: { find: async () => [acct], save: async () => {} },
      deviceQueueRepo: { find: async () => queueDoc, save: async (q) => savedQueues.push(q) },
      eventBus: { publish: async (e) => events.push(e.type) }
    };
  }

  it('retires the banned account, evicts it and promotes the next waiter', async () => {
    const ctx = replaceCtx({
      acct: account({ status: 'banned' }),
      queueDoc: { deviceId: 'd1', platform: 'telegram', activeSlots: 1, targetDepth: 3, activeAccountIds: ['a1'], waitingAccountIds: ['a2'], version: 5 }
    });
    const res = await replaceBannedHandler(ctx, { accountId: 'a1', deviceId: 'd1', platform: 'telegram' });
    expect(res.promotedId).toBe('a2');
    expect(ctx.events).toEqual(expect.arrayContaining(['account.retired', 'queue.low']));
  });

  it('no-queue is a safe no-op', async () => {
    const ctx = replaceCtx({ acct: account({ status: 'banned' }), queueDoc: null });
    const res = await replaceBannedHandler(ctx, { accountId: 'a1', deviceId: 'd1', platform: 'telegram' });
    expect(res).toMatchObject({ ok: true, reason: 'no-queue' });
  });
});
