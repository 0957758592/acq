// LIVE scrape persistence: ScrapeProvider (fake adapter) -> normalized entities
// -> idempotent upsert into real Mongo. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';
import { createMongoScrapeResultRepo } from '@acq/engine-infra';
import { createScrapeProvider } from '@acq/scraping';
import { scrapeTaskHandler } from './scrape-handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'e2etest';

// Fake browser-tier adapter returning two raw followers.
const adapters = { browser: { scrape: async () => ({ rawItems: [{ handle: 'fan1' }, { handle: 'fan2' }] }) } };

const ctx = {
  clock: { now: () => new Date('2026-07-22T15:00:00.000Z') },
  scrapeProvider: createScrapeProvider({ adapters }),
  scrapeResultRepo: createMongoScrapeResultRepo({ model: EngineScrapeResult }),
  eventBus: { publish: async () => {} }
};

beforeAll(async () => {
  await connectMongo(URI);
  await EngineScrapeResult.deleteMany({ platform: PLATFORM });
  await EngineScrapeResult.createIndexes();
});
afterAll(async () => {
  await EngineScrapeResult.deleteMany({ platform: PLATFORM });
  await disconnectMongo();
});

describe('scrape flow over LIVE Mongo', () => {
  it('persists normalized entities and is idempotent by natural key', async () => {
    const req = { platform: PLATFORM, targetType: 'followers', target: '@star', routing: { needsLogin: true } };
    await scrapeTaskHandler(ctx, req);

    let count = await EngineScrapeResult.countDocuments({ platform: PLATFORM });
    expect(count).toBe(2);
    const row = await EngineScrapeResult.findOne({ platform: PLATFORM }).lean();
    expect(row.key).toMatch(/^e2etest:follower:@star:@fan/);

    // Re-running the same scrape must not duplicate (idempotent upsert).
    await scrapeTaskHandler(ctx, req);
    count = await EngineScrapeResult.countDocuments({ platform: PLATFORM });
    expect(count).toBe(2);
  });
});
