import { buildSnapshot } from './snapshot.js';

function makeCtx(over = {}) {
  return {
    accountRepo: {
      countAvailable: async () => 4,
      find: async ({ _id }) => {
        void _id;
        return [
          { _id: 'a1', status: 'online' },
          { _id: 'a2', status: 'banned' }
        ];
      }
    },
    deviceQueueRepo: {
      listAll: async () => [
        {
          deviceId: 'd1',
          activeSlots: 1,
          targetDepth: 3,
          activeAccountIds: ['a1', 'a2'],
          waitingAccountIds: ['a3']
        }
      ]
    },
    deviceModel: {
      findById: () => ({ lean: async () => ({ status: 'running', provider: 'vmos' }) })
    },
    reportRepo: {
      listActiveCampaigns: async () => [
        {
          _id: 'c1',
          status: 'active',
          targets: ['+491700000001'],
          strategy: 'all-accounts-report-each-target'
        }
      ],
      doneKeys: async () => new Set(['c1:a1:+491700000001'])
    },
    config: { poolThreshold: 10, buyBatchSize: 5, autobuyEnabled: true },
    ...over
  };
}

describe('buildSnapshot', () => {
  it('projects pool, devices, and campaigns into the reconcile read-model', async () => {
    const snapshot = await buildSnapshot(makeCtx());

    expect(snapshot.pool.available).toBe(4);

    expect(snapshot.devices).toHaveLength(1);
    const device = snapshot.devices[0];
    expect(device.eligible).toBe(true);
    expect(device.queue.deviceId).toBe('d1');
    expect(device.queue.activeSlots).toBe(1);
    expect(device.queue.targetDepth).toBe(3);
    expect(device.queue.activeAccountIds).toEqual(['a1', 'a2']);
    expect(device.queue.waitingAccountIds).toEqual(['a3']);
    expect(device.bannedActiveAccountIds).toEqual(['a2']);
    expect(device.onlineAccountIds).toEqual(['a1']);

    expect(snapshot.campaigns).toHaveLength(1);
    expect(snapshot.campaigns[0]).toEqual({
      id: 'c1',
      status: 'active',
      targets: ['+491700000001'],
      strategy: 'all-accounts-report-each-target',
      doneKeys: ['c1:a1:+491700000001']
    });

    expect(snapshot.config).toEqual({
      poolThreshold: 10,
      buyBatchSize: 5,
      autobuyEnabled: true
    });
  });

  it('marks a device ineligible when its status is not running', async () => {
    const ctx = makeCtx({
      deviceModel: {
        findById: () => ({ lean: async () => ({ status: 'stopped', provider: 'vmos' }) })
      }
    });

    const snapshot = await buildSnapshot(ctx);

    expect(snapshot.devices[0].eligible).toBe(false);
  });
});
