import { probeHealthHandler } from './probe-health.handler.js';

const OWNER = 'whatsapp:test';
const fixedClock = { now: () => new Date('2026-07-09T00:00:00.000Z') };

function makeAccountDoc() {
  return {
    _id: 'a1',
    status: 'online',
    assignedDeviceId: 'd1',
    msisdn: '+491700000001',
    source: 'dark_shopping',
    secretRefs: {},
    health: { consecutiveFailures: 0, lastProbeAt: null },
    version: 0
  };
}

function makeCtx({ claim, probeState, find } = {}) {
  const calls = { saves: [], claim: [], release: [], publish: [], probe: [] };
  const claimFn = claim ?? (async () => ({ deviceId: 'd1' }));
  const probeStateFn = probeState ?? (async () => 'online');
  const findFn = find ?? (async () => [makeAccountDoc()]);

  const ctx = {
    owner: OWNER,
    clock: fixedClock,
    lease: {
      claim: async (deviceId, owner) => {
        calls.claim.push([deviceId, owner]);
        return claimFn(deviceId, owner);
      },
      release: async (deviceId, owner) => {
        calls.release.push([deviceId, owner]);
      }
    },
    accountRepo: {
      find: async (query) => {
        calls.find = query;
        return findFn(query);
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
    automation: {
      probeState: async (automationCtx) => {
        calls.probe.push(automationCtx);
        return probeStateFn(automationCtx);
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

describe('probeHealthHandler', () => {
  it('records a healthy probe on online and returns without a ban event', async () => {
    const { ctx, calls } = makeCtx({ probeState: async () => 'online' });

    const result = await probeHealthHandler({ accountId: 'a1', deviceId: 'd1' }, ctx);

    expect(result).toEqual({ state: 'online', healthy: true });

    // Exactly one save: the recordProbe single version bump.
    expect(calls.saves).toHaveLength(1);
    expect(calls.saves[0].version).toBe(1);
    expect(calls.saves[0].health.consecutiveFailures).toBe(0);
    expect(calls.saves[0].status).toBe('online');

    // No ban event.
    expect(calls.publish).toHaveLength(0);

    // Lease released in finally.
    expect(calls.release).toEqual([['d1', OWNER]]);
  });

  it('records an unhealthy probe then transitions to banned and publishes account.banned', async () => {
    const { ctx, calls } = makeCtx({ probeState: async () => 'banned' });

    const result = await probeHealthHandler({ accountId: 'a1', deviceId: 'd1' }, ctx);

    expect(result).toEqual({ state: 'banned', banned: true });

    // Two saves, single bump each: recordProbe (v1, unhealthy) then transition->banned (v2).
    expect(calls.saves).toHaveLength(2);
    expect(calls.saves[0].version).toBe(1);
    expect(calls.saves[0].health.consecutiveFailures).toBe(1);
    expect(calls.saves[1].version).toBe(2);
    expect(calls.saves[1].status).toBe('banned');

    // One ban event.
    expect(calls.publish).toHaveLength(1);
    expect(calls.publish[0].type).toBe('account.banned');
    expect(calls.publish[0].payload.accountId).toBe('a1');
    expect(calls.publish[0].payload.deviceId).toBe('d1');

    // Lease released in finally.
    expect(calls.release).toEqual([['d1', OWNER]]);
  });

  it('throws device-busy when the lease is not claimed and never probes or releases (retriable)', async () => {
    const { ctx, calls } = makeCtx({ claim: async () => null });

    await expect(probeHealthHandler({ accountId: 'a1', deviceId: 'd1' }, ctx)).rejects.toThrow('DEVICE_BUSY');
    expect(calls.saves).toHaveLength(0);
    expect(calls.probe).toHaveLength(0);
    expect(calls.release).toHaveLength(0);
  });
});
