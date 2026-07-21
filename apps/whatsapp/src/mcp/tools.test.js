import { REPORT_STRATEGIES } from '@acq/whatsapp';
import { buildTools } from './tools.js';

function makeCtx(over = {}) {
  const calls = { dispatch: [], createCampaign: [], setCampaignStatus: [], ensureQueue: [], ensureReady: [], order: [], save: [], find: [] };
  const ctx = {
    accountRepo: {
      countAvailable: async () => 7,
      find: async (filter) => {
        calls.find.push(filter);
        return [];
      },
      save: async (acct) => {
        calls.save.push(acct);
      }
    },
    deviceRegistration: {
      ensureReady: async (device) => {
        calls.ensureReady.push(device);
        calls.order.push('ensureReady');
      }
    },
    deviceQueueRepo: {
      ensureQueue: async (deviceId, targetDepth) => {
        calls.ensureQueue.push({ deviceId, targetDepth });
        calls.order.push('ensureQueue');
        return { deviceId, targetDepth };
      },
      find: async (deviceId) => ({ deviceId }),
      listAll: async () => []
    },
    reportRepo: {
      createCampaign: async (input) => {
        calls.createCampaign.push(input);
        return { _id: 'c1', ...input };
      },
      findCampaign: async (id) => ({ _id: id }),
      setCampaignStatus: async (id, status) => {
        calls.setCampaignStatus.push({ id, status });
        return { _id: id, status };
      },
      listActiveCampaigns: async () => []
    },
    jobDispatcher: {
      dispatch: async (queue, job, opts) => {
        calls.dispatch.push({ queue, job, opts });
        return { queued: true };
      }
    },
    config: { poolThreshold: 10, buyBatchSize: 5, deviceTargetDepth: 3, autobuyEnabled: true },
    clock: { now: () => new Date('2026-07-09T12:00:00.000Z') },
    logger: { error: () => {} },
    ...over
  };
  return { ctx, calls };
}

const byName = (tools, name) => tools.find((t) => t.name === name);

describe('buildTools', () => {
  it('returns 11 tools with the expected names', () => {
    const { ctx } = makeCtx();
    const tools = buildTools(ctx);
    expect(tools).toHaveLength(11);
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'account.retire',
        'campaign.create',
        'campaign.pause',
        'campaign.resume',
        'campaign.status',
        'campaign.stop',
        'device.enroll',
        'device.queue.get',
        'pool.buy',
        'pool.status',
        'reconcile.now'
      ].sort()
    );
  });

  it('each tool exposes a JSON inputSchema with additionalProperties:false', () => {
    const { ctx } = makeCtx();
    for (const tool of buildTools(ctx)) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('pool.status returns available/threshold/autobuyEnabled from ctx', async () => {
    const { ctx } = makeCtx();
    const tool = byName(buildTools(ctx), 'pool.status');
    await expect(tool.handler({})).resolves.toEqual({
      available: 7,
      threshold: 10,
      autobuyEnabled: true
    });
  });

  it('pool.buy validates then dispatches a buy-accounts job with an mcp-buy idempotency key', async () => {
    const { ctx, calls } = makeCtx();
    const tool = byName(buildTools(ctx), 'pool.buy');
    await tool.handler({ quantity: 5 });
    expect(calls.dispatch).toHaveLength(1);
    expect(calls.dispatch[0].queue).toBe('whatsapp.buy');
    expect(calls.dispatch[0].job).toEqual({ jobName: 'buy-accounts', payload: { quantity: 5 } });
    expect(calls.dispatch[0].opts.idempotencyKey.startsWith('mcp-buy:5:')).toBe(true);
  });

  it('pool.buy rejects an unknown field with MCP_ARGS_INVALID', async () => {
    const { ctx } = makeCtx();
    const tool = byName(buildTools(ctx), 'pool.buy');
    await expect(tool.handler({ quantity: 5, extra: 1 })).rejects.toThrow('MCP_ARGS_INVALID');
  });

  it('device.enroll provisions the device (ensureReady) before creating its queue', async () => {
    const { ctx, calls } = makeCtx();
    const tool = byName(buildTools(ctx), 'device.enroll');
    await tool.handler({ deviceId: 'd1', targetDepth: 3 });
    expect(calls.ensureReady).toEqual([{ providerDeviceId: 'd1' }]);
    expect(calls.ensureQueue).toEqual([{ deviceId: 'd1', targetDepth: 3 }]);
    // Provision THEN create the queue.
    expect(calls.order).toEqual(['ensureReady', 'ensureQueue']);
  });

  it('device.enroll aborts (no queue created) when provisioning fails', async () => {
    const { ctx, calls } = makeCtx({
      deviceRegistration: {
        ensureReady: async () => {
          throw new Error('WHATSAPP_TEAM_APP_NOT_FOUND');
        }
      }
    });
    const tool = byName(buildTools(ctx), 'device.enroll');
    await expect(tool.handler({ deviceId: 'd1', targetDepth: 3 })).rejects.toThrow('WHATSAPP_TEAM_APP_NOT_FOUND');
    expect(calls.ensureQueue).toHaveLength(0);
  });

  it('campaign.create validates then calls createCampaign', async () => {
    const { ctx, calls } = makeCtx();
    const tool = byName(buildTools(ctx), 'campaign.create');
    await tool.handler({ targets: ['+491700000001'], strategy: REPORT_STRATEGIES[0] });
    expect(calls.createCampaign).toEqual([
      { targets: ['+491700000001'], strategy: REPORT_STRATEGIES[0] }
    ]);
  });

  it('campaign.pause calls setCampaignStatus(id, "paused")', async () => {
    const { ctx, calls } = makeCtx();
    const tool = byName(buildTools(ctx), 'campaign.pause');
    await tool.handler({ id: 'c1' });
    expect(calls.setCampaignStatus).toEqual([{ id: 'c1', status: 'paused' }]);
  });

  it('campaign.resume/stop map to active/stopped', async () => {
    const { ctx, calls } = makeCtx();
    const tools = buildTools(ctx);
    await byName(tools, 'campaign.resume').handler({ id: 'c1' });
    await byName(tools, 'campaign.stop').handler({ id: 'c2' });
    expect(calls.setCampaignStatus).toEqual([
      { id: 'c1', status: 'active' },
      { id: 'c2', status: 'stopped' }
    ]);
  });

  it('account.retire rejects NOT_FOUND when the account is missing', async () => {
    const { ctx } = makeCtx();
    const tool = byName(buildTools(ctx), 'account.retire');
    await expect(tool.handler({ id: 'nope' })).rejects.toThrow('NOT_FOUND');
  });

  it('account.retire transitions an online account to retired and saves it', async () => {
    const saved = [];
    const { ctx } = makeCtx({
      accountRepo: {
        countAvailable: async () => 7,
        find: async () => [
          { _id: 'a1', msisdn: '+491700000001', source: 'dark_shopping', status: 'online', assignedDeviceId: 'd1', version: 0 }
        ],
        save: async (acct) => saved.push(acct)
      }
    });
    const tool = byName(buildTools(ctx), 'account.retire');
    const result = await tool.handler({ id: 'a1' });
    expect(result).toEqual({ ok: true, id: 'a1' });
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe('retired');
    expect(saved[0].version).toBe(1);
  });

  it('reconcile.now yields no dispatch when the snapshot needs no work', async () => {
    const { ctx, calls } = makeCtx({
      accountRepo: { countAvailable: async () => 100, find: async () => [], save: async () => {} },
      config: { poolThreshold: 10, buyBatchSize: 5, deviceTargetDepth: 3, autobuyEnabled: true }
    });
    const tool = byName(buildTools(ctx), 'reconcile.now');
    await expect(tool.handler({})).resolves.toEqual({ ok: true });
    expect(calls.dispatch).toHaveLength(0);
  });
});
