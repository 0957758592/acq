import { scrapeTaskHandler } from './scrape-handler.js';

const clock = { now: () => new Date('2026-07-22T15:00:00.000Z') };

function fakeCtx({ entities = [] } = {}) {
  const upserted = [];
  const events = [];
  return {
    upserted,
    events,
    clock,
    scrapeProvider: { scrape: async () => ({ tier: 'browser', entities }) },
    scrapeResultRepo: { upsertResults: async (e) => upserted.push(...e) },
    eventBus: { publish: async (ev) => events.push(ev.type) }
  };
}

describe('scrapeTaskHandler', () => {
  it('scrapes, upserts the normalized entities and emits scrape.done', async () => {
    const entities = [{ platform: 'ig', type: 'follower', key: 'ig:follower:@s:@f', data: {} }];
    const ctx = fakeCtx({ entities });
    const res = await scrapeTaskHandler(ctx, {
      platform: 'ig',
      targetType: 'followers',
      target: '@s',
      routing: { needsLogin: true }
    });
    expect(res).toMatchObject({ tier: 'browser', upserted: 1 });
    expect(ctx.upserted).toHaveLength(1);
    expect(ctx.events).toContain('scrape.done');
  });

  it('handles an empty scrape result (still emits done, upserts nothing)', async () => {
    const ctx = fakeCtx({ entities: [] });
    const res = await scrapeTaskHandler(ctx, { platform: 'ig', targetType: 'profile', target: '@s' });
    expect(res.upserted).toBe(0);
    expect(ctx.events).toContain('scrape.done');
  });
});
