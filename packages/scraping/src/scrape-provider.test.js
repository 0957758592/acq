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
