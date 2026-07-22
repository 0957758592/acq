import { createDeviceScrapeAdapter } from './device-scrape-adapter.js';

// Fake controller yielding successive UI dumps (as a real device would while
// scrolling a follower list), then a repeat (end of list).
function fakeController(dumps) {
  let i = 0;
  const swipes = [];
  return {
    swipes,
    getUIDump: async () => dumps[Math.min(i++, dumps.length - 1)],
    swipe: async (...a) => swipes.push(a)
  };
}

// Row extractor: pull @handles out of parsed nodes (here nodes are plain strings).
const extractRows = (nodes) => nodes.filter((t) => t.startsWith('@')).map((h) => ({ handle: h }));

describe('createDeviceScrapeAdapter (on-device tier — real UI-dump harvest)', () => {
  it('scrolls, harvests rows across dumps and dedups', async () => {
    const controller = fakeController([['@a', '@b'], ['@b', '@c'], ['@c']]);
    const adapter = createDeviceScrapeAdapter({
      provider: { createDirectController: () => controller },
      parseDump: (xml) => xml, // dumps are already arrays here
      extractRows,
      maxScrolls: 3,
      keyOf: (r) => r.handle
    });
    const { rawItems } = await adapter.scrape({ platform: 'instagram', targetType: 'followers', target: '@star', params: { deviceId: 'd1' } });
    expect(rawItems.map((r) => r.handle)).toEqual(['@a', '@b', '@c']);
    expect(controller.swipes.length).toBeGreaterThan(0);
  });

  it('stops early when no new rows appear (list exhausted)', async () => {
    const controller = fakeController([['@a'], ['@a'], ['@a']]);
    const adapter = createDeviceScrapeAdapter({
      provider: { createDirectController: () => controller },
      parseDump: (xml) => xml,
      extractRows,
      maxScrolls: 10,
      stopWhenDry: 2,
      keyOf: (r) => r.handle
    });
    const { rawItems } = await adapter.scrape({ platform: 'instagram', targetType: 'followers', target: '@s', params: { deviceId: 'd1' } });
    expect(rawItems.map((r) => r.handle)).toEqual(['@a']);
    expect(controller.swipes.length).toBeLessThan(10);
  });
});
