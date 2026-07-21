import { runReportTaskHandler } from './run-report-task.handler.js';

const OWNER = 'whatsapp:test';
const fixedClock = { now: () => new Date('2026-07-09T00:00:00.000Z') };

const PAYLOAD = { campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' };

function makeAccountDoc(over = {}) {
  return {
    _id: 'a1',
    status: 'online',
    assignedDeviceId: 'd1',
    msisdn: '+491700000001',
    source: 'dark_shopping',
    secretRefs: {},
    health: { consecutiveFailures: 0, lastProbeAt: null },
    version: 0,
    ...over
  };
}

function makeCtx({ task, reportTarget, claim, accountDoc, hasOpenTasks } = {}) {
  const calls = {
    upsert: [],
    markTask: [],
    saves: [],
    claim: [],
    release: [],
    publish: [],
    reportTarget: [],
    hasOpenTasks: [],
    setCampaignStatus: []
  };
  const taskDoc = task === undefined ? { _id: 't1', status: 'pending' } : task;
  const reportTargetFn = reportTarget ?? (async () => ({ ok: true }));
  const claimFn = claim ?? (async () => ({ deviceId: 'd1' }));
  const acctDoc = accountDoc === undefined ? makeAccountDoc() : accountDoc;
  const hasOpenTasksFn = hasOpenTasks ?? (async () => true);

  const ctx = {
    owner: OWNER,
    clock: fixedClock,
    reportRepo: {
      upsertTask: async (key) => {
        calls.upsert.push(key);
        return taskDoc;
      },
      markTask: async (id, status, error) => {
        calls.markTask.push([id, status, error]);
      },
      hasOpenTasks: async (campaignId) => {
        calls.hasOpenTasks.push(campaignId);
        return hasOpenTasksFn(campaignId);
      },
      setCampaignStatus: async (id, status) => {
        calls.setCampaignStatus.push([id, status]);
      }
    },
    accountRepo: {
      find: async (query) => {
        calls.find = query;
        return acctDoc ? [acctDoc] : [];
      },
      save: async (account) => {
        calls.saves.push(account);
      }
    },
    deviceModel: {
      findById: (id) => {
        calls.findById = id;
        return { lean: async () => ({ providerDeviceId: 'pdev1' }) };
      }
    },
    lease: {
      claim: async (deviceId, owner) => {
        calls.claim.push([deviceId, owner]);
        return claimFn(deviceId, owner);
      },
      release: async (deviceId, owner) => {
        calls.release.push([deviceId, owner]);
      }
    },
    automation: {
      reportTarget: async (automationCtx, target) => {
        calls.reportTarget.push([automationCtx, target]);
        return reportTargetFn(automationCtx, target);
      }
    },
    eventBus: {
      publish: async (evt) => {
        calls.publish.push(evt);
      }
    },
    logger: { warn: () => {} }
  };
  return { ctx, calls };
}

describe('runReportTaskHandler', () => {
  it('marks the task done, emits report.done, and releases the lease on a confirmed report (campaign still has open tasks)', async () => {
    const { ctx, calls } = makeCtx({ reportTarget: async () => ({ ok: true }), hasOpenTasks: async () => true });

    const result = await runReportTaskHandler(PAYLOAD, ctx);

    expect(result).toEqual({ ok: true });

    expect(calls.upsert).toEqual([{ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' }]);
    expect(calls.markTask).toEqual([['t1', 'done', undefined]]);

    // reportTarget invoked with the on-device automation ctx and the target msisdn.
    expect(calls.reportTarget).toHaveLength(1);
    const [automationCtx, target] = calls.reportTarget[0];
    expect(automationCtx.providerDeviceId).toBe('pdev1');
    expect(automationCtx.account).toEqual(expect.objectContaining({ id: 'a1', status: 'online' }));
    expect(target).toBe('+491700000001');

    // Single report.done event, no account save on the happy path.
    expect(calls.saves).toHaveLength(0);
    expect(calls.publish).toHaveLength(1);
    expect(calls.publish[0].type).toBe('report.done');
    expect(calls.publish[0].payload).toEqual({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' });

    // Open tasks remain -> campaign not completed, status untouched.
    expect(calls.hasOpenTasks).toEqual(['c1']);
    expect(calls.setCampaignStatus).toHaveLength(0);

    // Lease claimed then released.
    expect(calls.claim).toEqual([['d1', OWNER]]);
    expect(calls.release).toEqual([['d1', OWNER]]);
  });

  it('completes the campaign (setCampaignStatus + campaign.completed) when the last task is done', async () => {
    const { ctx, calls } = makeCtx({ reportTarget: async () => ({ ok: true }), hasOpenTasks: async () => false });

    const result = await runReportTaskHandler(PAYLOAD, ctx);

    expect(result).toEqual({ ok: true });
    expect(calls.markTask).toEqual([['t1', 'done', undefined]]);

    // No open tasks left -> campaign marked completed.
    expect(calls.hasOpenTasks).toEqual(['c1']);
    expect(calls.setCampaignStatus).toEqual([['c1', 'completed']]);

    // report.done first, then campaign.completed.
    expect(calls.publish).toHaveLength(2);
    expect(calls.publish[0].type).toBe('report.done');
    expect(calls.publish[1].type).toBe('campaign.completed');
    expect(calls.publish[1].payload).toEqual({ campaignId: 'c1' });

    expect(calls.release).toEqual([['d1', OWNER]]);
  });

  it('marks the task failed(banned), bans the account, emits account.banned, and releases the lease on a ban', async () => {
    const { ctx, calls } = makeCtx({ reportTarget: async () => ({ ok: false, banned: true }) });

    const result = await runReportTaskHandler(PAYLOAD, ctx);

    expect(result).toEqual({ ok: false, banned: true });

    expect(calls.markTask).toEqual([['t1', 'failed', 'banned']]);

    // Single account bump -> save, final status banned.
    expect(calls.saves).toHaveLength(1);
    expect(calls.saves[0].status).toBe('banned');
    expect(calls.saves[0].version).toBe(1);

    expect(calls.publish).toHaveLength(1);
    expect(calls.publish[0].type).toBe('account.banned');
    expect(calls.publish[0].payload).toEqual({ accountId: 'a1', deviceId: 'd1' });

    expect(calls.release).toEqual([['d1', OWNER]]);
  });

  it('short-circuits an already-done task without claiming the lease or reporting', async () => {
    const { ctx, calls } = makeCtx({ task: { _id: 't1', status: 'done' } });

    const result = await runReportTaskHandler(PAYLOAD, ctx);

    expect(result).toEqual({ skipped: true, reason: 'already-done' });

    expect(calls.markTask).toHaveLength(0);
    expect(calls.claim).toHaveLength(0);
    expect(calls.reportTarget).toHaveLength(0);
    expect(calls.release).toHaveLength(0);
  });

  it('marks the task failed(report-not-confirmed), releases the lease, then throws to retry when the report is not confirmed', async () => {
    const { ctx, calls } = makeCtx({ reportTarget: async () => ({ ok: false }) });

    await expect(runReportTaskHandler(PAYLOAD, ctx)).rejects.toThrow('REPORT_NOT_CONFIRMED');

    // Still marked failed before the throw.
    expect(calls.markTask).toEqual([['t1', 'failed', 'report-not-confirmed']]);

    // Not a ban: no account save, no event.
    expect(calls.saves).toHaveLength(0);
    expect(calls.publish).toHaveLength(0);

    // The throw is inside the try, so finally still releases the lease.
    expect(calls.release).toEqual([['d1', OWNER]]);
  });

  it('throws device-busy when the lease is not claimed, never reporting or releasing (retriable)', async () => {
    const { ctx, calls } = makeCtx({ claim: async () => null });

    await expect(runReportTaskHandler(PAYLOAD, ctx)).rejects.toThrow('DEVICE_BUSY');

    expect(calls.reportTarget).toHaveLength(0);
    expect(calls.markTask).toHaveLength(0);
    expect(calls.release).toHaveLength(0);
  });
});
