// LIVE: the FULL anon-http scrape path over real Mongo — a REAL http adapter
// (fetch -> extract embedded JSON -> pick) feeds the ScrapeProvider, which
// normalizes and idempotently upserts into Mongo. The fetch is stubbed with a
// real HTML fixture (no network), but the adapter's fetch+extract+pick pipeline
// is the real production code. test:live.
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';
import { createMongoScrapeResultRepo } from '@acq/engine-infra';
import { createScrapeProvider, createHttpScrapeAdapter } from '@acq/scraping';
import { scrapeTaskHandler } from './scrape-handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'e2etest';

// A realistic public page with an embedded follower list.
const HTML = `<html><body><script>window['SIGI_STATE']={"followers":[{"handle":"fan1"},{"handle":"fan2"},{"handle":"fan3"}]};</script></body></html>`;
const fetchImpl = async () => ({ ok: true, status: 200, text: async () => HTML });

const httpAdapter = createHttpScrapeAdapter({
  fetchImpl,
  resolveUrl: ({ target }) => `https://public.example/${target}`,
  pickItems: (state) => state.followers
});

const ctx = {
  clock: { now: () => new Date('2026-07-22T17:00:00.000Z') },
  scrapeProvider: createScrapeProvider({ adapters: { http: httpAdapter } }),
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

describe('REAL anon-http scrape path over LIVE Mongo', () => {
  it('fetches, extracts embedded JSON, normalizes and persists followers', async () => {
    // routing without needsLogin + small volume -> http tier (the real adapter).
    const res = await scrapeTaskHandler(ctx, {
      platform: PLATFORM,
      targetType: 'followers',
      target: '@star',
      routing: { needsLogin: false, volume: 'small' }
    });
    expect(res.tier).toBe('http');

    const count = await EngineScrapeResult.countDocuments({ platform: PLATFORM, type: 'follower' });
    expect(count).toBe(3);
    const row = await EngineScrapeResult.findOne({ platform: PLATFORM }).lean();
    expect(row.key).toMatch(/^e2etest:follower:@star:@fan/);
  });
});
