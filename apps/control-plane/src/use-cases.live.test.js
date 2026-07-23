// LIVE: the wired facade use-cases drive the campaign + account lifecycle over
// REAL Mongo (buildEngineContext + buildUseCases), proving the single facade
// moves real state across surfaces. Isolated by a marker platform/actionType.
import { createFacade } from '@acq/control';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineCampaign } from '@acq/core/models/engine-campaign';
import { EngineDevice } from '@acq/core/models/engine-device';

import { buildEngineContext } from '../../engine/src/composition.js';
import { buildUseCases } from './use-cases.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'telegram';
// A REAL supported telegram action (join/dm/report/view) — campaign.create now
// rejects unsupported actionTypes up-front. Isolate by a unique marker target.
const ACTION = 'report';
const MARKER_TARGET = '@e2e_facade_marker';

let facade;
let accountId;
let deviceProviderId;

beforeAll(async () => {
  await connectMongo(URI);
  await EngineCampaign.deleteMany({ platform: PLATFORM, targets: MARKER_TARGET });
  await EngineAccount.deleteMany({ identifier: '@e2e_facade' });
  await EngineDevice.deleteMany({ providerDeviceId: 'e2e-facade-pad' });

  const acct = await EngineAccount.create({ platform: PLATFORM, identifier: '@e2e_facade', source: 'purchase', status: 'online', assignedDeviceId: 'd-e2e', version: 0 });
  accountId = String(acct._id);
  deviceProviderId = 'e2e-facade-pad';

  const ctx = buildEngineContext({ env: { platforms: [PLATFORM] } });
  facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
});

afterAll(async () => {
  await EngineCampaign.deleteMany({ platform: PLATFORM, targets: MARKER_TARGET });
  await EngineAccount.deleteMany({ identifier: '@e2e_facade' });
  await EngineDevice.deleteMany({ providerDeviceId: 'e2e-facade-pad' });
  await disconnectMongo();
});

describe('facade use-cases over LIVE Mongo', () => {
  it('device.enroll persists a real EngineDevice row', async () => {
    const res = await facade.execute('device.enroll', { role: 'operator', args: { provider: 'vmos', providerDeviceId: deviceProviderId, capacity: { maxAccounts: 4 } } });
    expect(res.data.deviceId).toBeTruthy();
    const doc = await EngineDevice.findOne({ providerDeviceId: deviceProviderId }).lean();
    expect(doc.capacity.maxAccounts).toBe(4);
  });

  it('campaign.create -> status -> stop moves a real campaign row', async () => {
    const created = await facade.execute('campaign.create', { role: 'operator', args: { platform: PLATFORM, actionType: ACTION, targets: [MARKER_TARGET] } });
    const id = created.data.campaignId;
    expect(created.data.status).toBe('active');

    const active = await facade.execute('campaign.status', { role: 'readonly', args: { platform: PLATFORM } });
    expect(active.data.campaigns.some((c) => String(c._id) === id)).toBe(true);

    const stopped = await facade.execute('campaign.stop', { role: 'operator', args: { campaignId: id } });
    expect(stopped.data.status).toBe('stopped');
    const doc = await EngineCampaign.findById(id).lean();
    expect(doc.status).toBe('stopped');
  });

  it('account.cooldown transitions a real account row with opt-lock', async () => {
    const res = await facade.execute('account.cooldown', { role: 'operator', args: { accountId } });
    expect(res.data.status).toBe('cooldown');
    const doc = await EngineAccount.findById(accountId).lean();
    expect(doc.status).toBe('cooldown');
    expect(doc.version).toBe(1);
  });
});
