import { buildResources } from './resources.js';

function makeCtx(over = {}) {
  const ctx = {
    accountRepo: {
      countAvailable: async () => 7,
      find: async () => []
    },
    deviceQueueRepo: {
      listAll: async () => []
    },
    reportRepo: {
      findCampaign: async (id) => ({ _id: id, status: 'active' })
    },
    config: { poolThreshold: 10, autobuyEnabled: true },
    ...over
  };
  return ctx;
}

describe('buildResources', () => {
  it('list() returns the two static resources', () => {
    const { list } = buildResources(makeCtx());
    expect(list()).toEqual([
      { uri: 'whatsapp://pool/summary', name: 'Pool summary', mimeType: 'application/json' },
      { uri: 'whatsapp://devices', name: 'Devices', mimeType: 'application/json' }
    ]);
  });

  it('read(whatsapp://pool/summary) returns available/threshold/autobuyEnabled', async () => {
    const { read } = buildResources(makeCtx());
    await expect(read('whatsapp://pool/summary')).resolves.toEqual({
      available: 7,
      threshold: 10,
      autobuyEnabled: true
    });
  });

  it('read(whatsapp://devices) maps queues through publicDevice', async () => {
    const { read } = buildResources(
      makeCtx({
        deviceQueueRepo: {
          listAll: async () => [
            {
              deviceId: 'd1',
              activeSlots: 2,
              targetDepth: 3,
              activeAccountIds: ['a1'],
              waitingAccountIds: ['a2', 'a3'],
              version: 4
            }
          ]
        }
      })
    );
    await expect(read('whatsapp://devices')).resolves.toEqual([
      {
        deviceId: 'd1',
        activeSlots: 2,
        targetDepth: 3,
        activeAccountIds: ['a1'],
        waitingAccountIds: ['a2', 'a3'],
        version: 4
      }
    ]);
  });

  it('read(whatsapp://accounts/a1) strips secretRefs but keeps msisdn/status', async () => {
    const { read } = buildResources(
      makeCtx({
        accountRepo: {
          countAvailable: async () => 7,
          find: async () => [
            {
              _id: 'a1',
              msisdn: '+491700000001',
              source: 'dark_shopping',
              status: 'online',
              assignedDeviceId: 'd1',
              health: { consecutiveFailures: 0, lastProbeAt: null },
              version: 2,
              secretRefs: { session: 'keychain:x' }
            }
          ]
        }
      })
    );
    const result = await read('whatsapp://accounts/a1');
    expect('secretRefs' in result).toBe(false);
    expect(result.msisdn).toBe('+491700000001');
    expect(result.status).toBe('online');
    expect(result.id).toBe('a1');
    expect(result.assignedDeviceId).toBe('d1');
  });

  it('read(whatsapp://accounts/<id>) rejects NOT_FOUND when the account is missing', async () => {
    const { read } = buildResources(makeCtx());
    await expect(read('whatsapp://accounts/missing')).rejects.toThrow('NOT_FOUND');
  });

  it('read(whatsapp://accounts/<id>) maps a Mongoose CastError to NOT_FOUND (not a generic error)', async () => {
    const { read } = buildResources(
      makeCtx({
        accountRepo: {
          countAvailable: async () => 7,
          find: async () => {
            throw Object.assign(new Error('cast'), { name: 'CastError' });
          }
        }
      })
    );
    await expect(read('whatsapp://accounts/not-a-valid-objectid')).rejects.toThrow('NOT_FOUND');
  });

  it('read(whatsapp://campaigns/<id>) maps a Mongoose CastError to NOT_FOUND (not a generic error)', async () => {
    const { read } = buildResources(
      makeCtx({
        reportRepo: {
          findCampaign: async () => {
            throw Object.assign(new Error('cast'), { name: 'CastError' });
          }
        }
      })
    );
    await expect(read('whatsapp://campaigns/not-a-valid-objectid')).rejects.toThrow('NOT_FOUND');
  });

  it('read(whatsapp://campaigns/c1) returns the campaign', async () => {
    const { read } = buildResources(makeCtx());
    await expect(read('whatsapp://campaigns/c1')).resolves.toEqual({ _id: 'c1', status: 'active' });
  });

  it('read(whatsapp://campaigns/<id>) rejects NOT_FOUND when the campaign is missing', async () => {
    const { read } = buildResources(makeCtx({ reportRepo: { findCampaign: async () => null } }));
    await expect(read('whatsapp://campaigns/missing')).rejects.toThrow('NOT_FOUND');
  });

  it('read(unknown uri) rejects NOT_FOUND', async () => {
    const { read } = buildResources(makeCtx());
    await expect(read('whatsapp://nope')).rejects.toThrow('NOT_FOUND');
  });
});
