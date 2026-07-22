// LIVE: the GENERIC engine drives a NON-whatsapp platform (telegram) through
// bring-online, over real Mongo + the real telegram driver. The driver's
// session-import is an honest verify-by-fact seam, so the account is reverted to
// `assigned` and reported blocked — NOT a fake "online". Proves the lifecycle is
// not whatsapp-only. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineDevice } from '@acq/core/models/engine-device';
import { buildEngineContext } from './composition.js';
import { bringOnlineHandler } from './handlers/bring-online.handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'telegram';

let ctx;
let deviceId;
let accountId;

beforeAll(async () => {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ identifier: '@e2e_online' });
  await EngineDevice.deleteMany({ providerDeviceId: 'e2e-online-dev' });

  const device = await EngineDevice.create({ provider: 'duoplus', providerDeviceId: 'e2e-online-dev', status: 'running' });
  deviceId = String(device._id);
  const acc = await EngineAccount.create({
    platform: PLATFORM, identifier: '@e2e_online', status: 'assigned', assignedDeviceId: deviceId, version: 0
  });
  accountId = String(acc._id);

  // Real engine ctx, but with a FAKE device provider so createDirectController
  // works without a live phone (the seam throws before any real device I/O).
  ctx = buildEngineContext({
    env: { platforms: [PLATFORM] },
    deps: { provider: { createDirectController: () => ({ getUIDump: async () => '<hierarchy/>' }) } }
  });
});

afterAll(async () => {
  await EngineAccount.deleteMany({ identifier: '@e2e_online' });
  await EngineDevice.deleteMany({ providerDeviceId: 'e2e-online-dev' });
  await disconnectMongo();
});

describe('generic bring-online for telegram over LIVE Mongo', () => {
  it('drives the real telegram driver and reverts to assigned on the honest session-import seam', async () => {
    const res = await bringOnlineHandler(ctx, { accountId, deviceId });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('TELEGRAM_SESSION_IMPORT_UNVERIFIED');

    const row = await EngineAccount.findById(accountId).lean();
    expect(row.status).toBe('assigned'); // reverted — never a fake "online"
  });
});
