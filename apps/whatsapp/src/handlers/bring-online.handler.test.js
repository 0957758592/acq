import { bringOnlineHandler } from './bring-online.handler.js';
import { domainError } from '@acq/whatsapp';

const OWNER = 'whatsapp:test';
const fixedClock = { now: () => new Date('2026-07-09T00:00:00.000Z') };

function makeAccountDoc() {
  return {
    _id: 'a1',
    status: 'assigned',
    assignedDeviceId: 'd1',
    msisdn: '+491700000001',
    source: 'dark_shopping',
    secretRefs: {},
    health: { consecutiveFailures: 0, lastProbeAt: null },
    version: 0
  };
}

function makeCtx({ claim, bringOnline, find } = {}) {
  const calls = { saves: [], claim: [], release: [], publish: [], warn: [] };
  const claimFn = claim ?? (async () => ({ deviceId: 'd1' }));
  const bringOnlineFn = bringOnline ?? (async () => ({ ok: true }));
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
      bringOnline: async (automationCtx) => {
        calls.automation = automationCtx;
        return bringOnlineFn(automationCtx);
      }
    },
    eventBus: {
      publish: async (evt) => {
        calls.publish.push(evt);
      }
    },
    logger: {
      warn: (...args) => {
        calls.warn.push(args);
      }
    }
  };
  return { ctx, calls };
}

describe('bringOnlineHandler', () => {
  it('catches WHATSAPP_SESSION_IMPORT_UNVERIFIED, reverts to assigned, and returns blocked (no thrash)', async () => {
    const { ctx, calls } = makeCtx({
      bringOnline: async () => {
        throw domainError('WHATSAPP_SESSION_IMPORT_UNVERIFIED', 'x');
      }
    });

    const result = await bringOnlineHandler({ deviceId: 'd1', accountId: 'a1' }, ctx);

    expect(result).toEqual({ blocked: true, reason: 'session-import-unverified' });

    // assigned -> bringing_online (save 1), then reverted bringing_online -> assigned (save 2).
    expect(calls.saves).toHaveLength(2);
    expect(calls.saves[0].status).toBe('bringing_online');
    expect(calls.saves[1].status).toBe('assigned');

    // Lease released in finally.
    expect(calls.release).toEqual([['d1', OWNER]]);

    // Blocked is not a ban: no event published.
    expect(calls.publish).toHaveLength(0);
  });

  it('throws device-busy when the lease is not claimed and never releases (retriable)', async () => {
    const { ctx, calls } = makeCtx({ claim: async () => null });

    await expect(bringOnlineHandler({ deviceId: 'd1', accountId: 'a1' }, ctx)).rejects.toThrow('DEVICE_BUSY');
    expect(calls.saves).toHaveLength(0);
    expect(calls.release).toHaveLength(0);
  });

  it('drives assigned -> bringing_online -> online on success and releases the lease', async () => {
    const { ctx, calls } = makeCtx({ bringOnline: async () => ({ ok: true }) });

    const result = await bringOnlineHandler({ deviceId: 'd1', accountId: 'a1' }, ctx);

    expect(result).toEqual({ ok: true });
    expect(calls.saves).toHaveLength(2);
    expect(calls.saves[0].status).toBe('bringing_online');
    expect(calls.saves[1].status).toBe('online');
    expect(calls.release).toEqual([['d1', OWNER]]);
  });

  it('transitions to banned and publishes account.banned when automation reports a ban', async () => {
    const { ctx, calls } = makeCtx({ bringOnline: async () => ({ ok: false, banned: true }) });

    const result = await bringOnlineHandler({ deviceId: 'd1', accountId: 'a1' }, ctx);

    expect(result).toEqual({ ok: false, banned: true });
    expect(calls.saves).toHaveLength(2);
    expect(calls.saves[1].status).toBe('banned');
    expect(calls.publish).toHaveLength(1);
    expect(calls.publish[0].type).toBe('account.banned');
    expect(calls.publish[0].payload.accountId).toBe('a1');
    expect(calls.release).toEqual([['d1', OWNER]]);
  });
});
