import { runActionTaskHandler } from './run-action-task.handler.js';

const clock = { now: () => new Date('2026-07-22T10:00:00.000Z') };

function fakeCtx({ actionResult = { ok: true }, openAfter = false } = {}) {
  const calls = { upsert: [], mark: [], events: [], actions: [] };
  return {
    calls,
    clock,
    actionTaskRepo: {
      upsertTask: async (t) => calls.upsert.push(t),
      markTask: async (k, s) => calls.mark.push({ k, s }),
      hasOpenTasks: async () => openAfter
    },
    automation: {
      runAction: async (accCtx, action) => {
        calls.actions.push({ accCtx, action });
        return actionResult;
      }
    },
    eventBus: { publish: async (e) => calls.events.push(e.type) }
  };
}

const payload = { campaignId: 'c1', accountId: 'a1', target: 't1', actionType: 'follow' };

describe('runActionTaskHandler', () => {
  it('upserts (exactly-once), runs the action, marks done and emits action.done', async () => {
    const ctx = fakeCtx({ actionResult: { ok: true }, openAfter: true });
    const res = await runActionTaskHandler(ctx, payload);
    expect(res).toEqual({ ok: true });
    expect(ctx.calls.upsert).toHaveLength(1);
    expect(ctx.calls.mark.map((m) => m.s)).toEqual(['running', 'done']);
    expect(ctx.calls.events).toContain('action.done');
  });

  it('emits campaign.completed when no open tasks remain', async () => {
    const ctx = fakeCtx({ actionResult: { ok: true }, openAfter: false });
    await runActionTaskHandler(ctx, payload);
    expect(ctx.calls.events).toEqual(expect.arrayContaining(['action.done', 'campaign.completed']));
  });

  it('handles a mid-flow ban: marks failed and emits account.banned', async () => {
    const ctx = fakeCtx({ actionResult: { ok: false, banned: true } });
    const res = await runActionTaskHandler(ctx, payload);
    expect(res).toMatchObject({ ok: false, banned: true });
    expect(ctx.calls.mark.map((m) => m.s)).toContain('failed');
    expect(ctx.calls.events).toContain('account.banned');
  });

  it('marks failed (transient) when the action is not confirmed', async () => {
    const ctx = fakeCtx({ actionResult: { ok: false } });
    const res = await runActionTaskHandler(ctx, payload);
    expect(res.ok).toBe(false);
    expect(ctx.calls.mark.map((m) => m.s)).toContain('failed');
    expect(ctx.calls.events).not.toContain('action.done');
  });
});
