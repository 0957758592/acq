import { createHttpScrapeAdapter } from './http-scrape-adapter.js';

// Real HTML with an embedded state blob (what a public page actually ships).
const HTML = `<!doctype html><html><head></head><body>
<script>window['SIGI_STATE']={"UserModule":{"users":{"bob":{"uniqueId":"bob","nickname":"Bob","stats":{"followerCount":1234}}}}};</script>
</body></html>`;

const CAPTCHA_HTML = `<html><body>Please verify you are not a robot (captcha)</body></html>`;

function fakeFetch(html, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return { ok, status, text: async () => html };
  };
  impl.calls = calls;
  return impl;
}

describe('createHttpScrapeAdapter (anon-http tier — real fetch + extract)', () => {
  it('fetches the resolved URL, extracts embedded JSON and picks items', async () => {
    const fetchImpl = fakeFetch(HTML);
    const adapter = createHttpScrapeAdapter({
      fetchImpl,
      resolveUrl: ({ platform, target }) => `https://${platform}.example/@${target}`,
      pickItems: (state) => Object.values(state.UserModule.users)
    });
    const { rawItems } = await adapter.scrape({ platform: 'tiktok', targetType: 'profile', target: 'bob' });
    expect(fetchImpl.calls[0]).toBe('https://tiktok.example/@bob');
    expect(rawItems).toEqual([{ uniqueId: 'bob', nickname: 'Bob', stats: { followerCount: 1234 } }]);
  });

  it('signals a captcha wall (hard-stop, not a guess)', async () => {
    const adapter = createHttpScrapeAdapter({
      fetchImpl: fakeFetch(CAPTCHA_HTML),
      resolveUrl: () => 'https://x',
      pickItems: () => []
    });
    expect(await adapter.scrape({ platform: 'tiktok', targetType: 'profile', target: 'x' })).toEqual({ captcha: true });
  });

  it('throws SCRAPE_TARGET_UNAVAILABLE when the page has no embedded state', async () => {
    const adapter = createHttpScrapeAdapter({
      fetchImpl: fakeFetch('<html><body>nothing</body></html>'),
      resolveUrl: () => 'https://x',
      pickItems: () => []
    });
    await expect(adapter.scrape({ platform: 'tiktok', targetType: 'profile', target: 'x' })).rejects.toMatchObject({
      code: 'SCRAPE_TARGET_UNAVAILABLE'
    });
  });

  it('throws SCRAPE_TARGET_UNAVAILABLE on a non-ok HTTP status', async () => {
    const adapter = createHttpScrapeAdapter({
      fetchImpl: fakeFetch('', { ok: false, status: 404 }),
      resolveUrl: () => 'https://x',
      pickItems: () => []
    });
    await expect(adapter.scrape({ platform: 'tiktok', targetType: 'profile', target: 'x' })).rejects.toMatchObject({
      code: 'SCRAPE_TARGET_UNAVAILABLE'
    });
  });
});
