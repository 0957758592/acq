// LIVE: the GENERIC reconciler self-drives a NON-whatsapp platform (telegram)
// off REAL Mongo state — projecting devices + queues + accounts + campaigns and
// emitting the full intent set (fill-queue / bring-online / expand-actions),
// not just a pool acquire. This is the WA_FEAT autonomous loop for ALL account
// types. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineDevice } from '@acq/core/models/engine-device';
import { EngineDeviceQueue } from '@acq/core/models/engine-device-queue';
import { EngineCampaign } from '@acq/core/models/engine-campaign';
import { buildEngineContext } from './composition.js';
import { planForPlatform } from './snapshot.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'telegram';
const MARK = '@selfdrive';

let ctx;
let deviceId;

beforeAll(async () => {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ identifier: { $regex: '^@selfdrive' } });
  await EngineDevice.deleteMany({ providerDeviceId: 'selfdrive-dev' });
  await EngineDeviceQueue.deleteMany({ platform: PLATFORM, activeSlots: 9 });
  await EngineCampaign.deleteMany({ platform: PLATFORM, actionType: 'selfdrive-follow' });

  const device = await EngineDevice.create({ provider: 'vmos', providerDeviceId: 'selfdrive-dev', status: 'running', capacity: { maxAccounts: 5 } });
  deviceId = String(device._id);

  // An online account on the device, a waiting account in the queue, and spare
  // acquired accounts in the pool.
  const online = await EngineAccount.create({ platform: PLATFORM, identifier: `${MARK}_online`, status: 'online', assignedDeviceId: deviceId, version: 4 });
  const waiting = await EngineAccount.create({ platform: PLATFORM, identifier: `${MARK}_wait`, status: 'assigned', assignedDeviceId: deviceId, version: 1 });
  await EngineAccount.insertMany([
    { platform: PLATFORM, identifier: `${MARK}_pool1`, status: 'acquired', assignedDeviceId: null, version: 0 },
    { platform: PLATFORM, identifier: `${MARK}_pool2`, status: 'acquired', assignedDeviceId: null, version: 0 }
  ]);

  await EngineDeviceQueue.create({
    deviceId, platform: PLATFORM, activeSlots: 9, targetDepth: 5,
    activeAccountIds: [String(online._id)], waitingAccountIds: [String(waiting._id)], version: 0
  });

  await EngineCampaign.create({
    platform: PLATFORM, actionType: 'selfdrive-follow', status: 'active',
    strategy: 'all-accounts-per-target', targets: ['@target1'], version: 0
  });

  ctx = buildEngineContext({ env: { platforms: [PLATFORM], poolThreshold: 3, buyBatchSize: 5, autobuyEnabled: true } });
});

afterAll(async () => {
  await EngineAccount.deleteMany({ identifier: { $regex: '^@selfdrive' } });
  await EngineDevice.deleteMany({ providerDeviceId: 'selfdrive-dev' });
  await EngineDeviceQueue.deleteMany({ platform: PLATFORM, activeSlots: 9 });
  await EngineCampaign.deleteMany({ platform: PLATFORM, actionType: 'selfdrive-follow' });
  await disconnectMongo();
});

describe('generic reconciler self-drive for telegram (LIVE Mongo)', () => {
  it('emits the full intent set from real device/queue/campaign state', async () => {
    const intents = await planForPlatform(ctx, { platform: PLATFORM });
    const types = new Set(intents.map((i) => i.type));

    // bring-online for the waiting account (free active slot).
    expect(types.has('bring-online')).toBe(true);
    // expand-actions for the active campaign against the online account.
    expect(types.has('expand-actions')).toBe(true);
    const expand = intents.find((i) => i.type === 'expand-actions');
    expect(expand.tasks.length).toBeGreaterThan(0);
    expect(expand.tasks[0].actionType).toBe('selfdrive-follow');
  });
});
