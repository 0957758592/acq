import { createScrapeProvider } from './scrape-provider.js';
import { domainError } from '@acq/engine-domain';

function fakeAdapter(rawItems) {
  return { scrape: async () => ({ rawItems }) };
}

describe('createScrapeProvider.scrape', () => {
  test('routes login-gated data to the browser tier and normalizes output', async () => {
    const provider = createScrapeProvider({
      adapters: { browser: fakeAdapter([{ handle: 'fan1' }]) }
    });
    const result = await provider.scrape({
      platform: 'ig',
      targetType: 'followers',
      target: '@star',
      routing: { needsLogin: true }
    });
    expect(result.tier).toBe('browser');
    expect(result.entities[0].key).toBe('ig:follower:@star:@fan1');
  });

  test('routes simple public small data to the http tier', async () => {
    const provider = createScrapeProvider({
      adapters: { http: fakeAdapter([{ handle: 'bob', followers: 5 }]) }
    });
    const result = await provider.scrape({
      platform: 'tiktok',
      targetType: 'profile',
      target: '@bob',
      routing: { needsLogin: false, volume: 'small' }
    });
    expect(result.tier).toBe('http');
    expect(result.entities[0].data.followers).toBe(5);
  });

  test('defaults to the browser (web) tier for telegram, but opts into the api tier via params.via="bot-api"', async () => {
    const provider = createScrapeProvider({
      adapters: {
        browser: fakeAdapter([{ id: '1', text: 'from web', from: 'ann' }]),
        api: fakeAdapter([{ id: '9', text: 'from bot', from: 'bob' }])
      }
    });
    // DEFAULT — no params → web scraper (browser)
    const web = await provider.scrape({ platform: 'telegram', targetType: 'messages', target: 'g1' });
    expect(web.tier).toBe('browser');
    expect(web.entities[0].data.text).toBe('from web');
    // OPT-IN via params → bot-api (api tier)
    const bot = await provider.scrape({ platform: 'telegram', targetType: 'messages', target: 'g1', params: { via: 'bot-api' } });
    expect(bot.tier).toBe('api');
    expect(bot.entities[0].data.text).toBe('from bot');
  });

  test('opts into the mtproto tier via params.via="mtproto" (default stays browser; bot-api still → api)', async () => {
    const provider = createScrapeProvider({
      adapters: {
        browser: fakeAdapter([{ id: '1', text: 'web', from: 'ann' }]),
        api: fakeAdapter([{ id: '2', text: 'bot', from: 'bob' }]),
        mtproto: fakeAdapter([{ id: '3', text: 'mtproto full history', from: 'carol' }])
      }
    });
    expect((await provider.scrape({ platform: 'telegram', targetType: 'messages', target: 'g' })).tier).toBe('browser');
    expect((await provider.scrape({ platform: 'telegram', targetType: 'messages', target: 'g', params: { via: 'bot-api' } })).tier).toBe('api');
    const mt = await provider.scrape({ platform: 'telegram', targetType: 'messages', target: 'g', params: { via: 'mtproto' } });
    expect(mt.tier).toBe('mtproto');
    expect(mt.entities[0].data.text).toBe('mtproto full history');
  });

  test('throws SCRAPE_TIER_UNAVAILABLE when the selected tier has no adapter', async () => {
    const provider = createScrapeProvider({ adapters: { http: fakeAdapter([]) } });
    await expect(
      provider.scrape({ platform: 'ig', targetType: 'followers', target: '@x', routing: { needsLogin: true } })
    ).rejects.toMatchObject({ code: 'SCRAPE_TIER_UNAVAILABLE' });
  });

  test('throws SCRAPE_CAPTCHA when the adapter signals a captcha wall', async () => {
    const provider = createScrapeProvider({
      adapters: { browser: { scrape: async () => ({ captcha: true }) } }
    });
    await expect(
      provider.scrape({ platform: 'ig', targetType: 'followers', target: '@x', routing: { needsLogin: true } })
    ).rejects.toMatchObject({ code: 'SCRAPE_CAPTCHA' });
  });

  test('propagates a captcha hard-stop thrown by the adapter', async () => {
    const provider = createScrapeProvider({
      adapters: {
        browser: {
          scrape: async () => {
            throw domainError('SCRAPE_CAPTCHA', 'captcha wall');
          }
        }
      }
    });
    await expect(
      provider.scrape({ platform: 'ig', targetType: 'followers', target: '@x', routing: { needsLogin: true } })
    ).rejects.toMatchObject({ code: 'SCRAPE_CAPTCHA' });
  });
});
