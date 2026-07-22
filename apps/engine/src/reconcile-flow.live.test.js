// LIVE end-to-end: real Mongo pool state -> snapshot -> reconcile -> intents.
// Proves the generic engine plans correctly off persisted data. `test:live` only.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { buildEngineContext } from './composition.js';
import { planForPlatform } from './snapshot.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'e2etest';

const ctx = buildEngineContext({
  env: { platforms: ['whatsapp', 'telegram'], poolThreshold: 10, buyBatchSize: 5, autobuyEnabled: true }
});

beforeAll(async () => {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ platform: PLATFORM });
});

afterAll(async () => {
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await disconnectMongo();
});

describe('reconcile flow against LIVE Mongo', () => {
  it('emits an acquire intent when the live pool is below threshold', async () => {
    await ctx.accountRepo.insertAcquired(
      [
        { platform: PLATFORM, identifier: '@rf_1', source: 'purchase', secretRefs: {} },
        { platform: PLATFORM, identifier: '@rf_2', source: 'purchase', secretRefs: {} }
      ],
      { orderId: 'RF' }
    );

    const intents = await planForPlatform(ctx, { platform: PLATFORM, source: 'purchase' });
    const acquire = intents.find((i) => i.type === 'acquire');
    expect(acquire).toMatchObject({ platform: PLATFORM, source: 'purchase' });
    // gap = 10 - 2 = 8, rounded up to batches of 5 => 10
    expect(acquire.quantity).toBe(10);
  });

  it('emits no acquire intent once the pool meets the threshold', async () => {
    const filler = Array.from({ length: 10 }, (_v, i) => ({
      platform: PLATFORM,
      identifier: `@rf_full_${i}`,
      source: 'purchase',
      secretRefs: {}
    }));
    await ctx.accountRepo.insertAcquired(filler, { orderId: 'RF-FULL' });

    const intents = await planForPlatform(ctx, { platform: PLATFORM, source: 'purchase' });
    expect(intents.find((i) => i.type === 'acquire')).toBeUndefined();
  });
});
