// LIVE: drives the REAL Puppeteer + CDP Chromium engine end-to-end through the
// production provider + browser scrape adapter + ScrapeProvider normalization,
// against a deterministic offline page (a data: URL — no network flakiness).
// Proves the full browser tier works with a real browser. Requires Puppeteer's
// bundled Chromium (installed with the package); skips cleanly if it is absent.
import { createPuppeteerBrowserProvider } from './puppeteer-browser-provider.js';
import { createBrowserScrapeAdapter } from './browser-scrape-adapter.js';
import { createScrapeProvider } from '../scrape-provider.js';

const PAGE = `data:text/html,${encodeURIComponent(`
  <html><body>
    <ul id="followers">
      <li class="user" data-handle="@alice">Alice</li>
      <li class="user" data-handle="@bob">Bob</li>
      <li class="user" data-handle="@carol">Carol</li>
    </ul>
  </body></html>`)}`;

// Runs in the browser context: pull the follower rows off the DOM.
const extractItems = () =>
  Array.from(document.querySelectorAll('#followers .user')).map((el) => ({
    externalId: el.getAttribute('data-handle'),
    handle: el.getAttribute('data-handle'),
    displayName: el.textContent
  }));

let available = true;
let provider;

beforeAll(async () => {
  provider = createPuppeteerBrowserProvider({ maxConcurrency: 2, headless: true });
  try {
    const page = await provider.openPage({});
    await page.close();
  } catch (err) {
    if (err.code === 'BROWSER_ENGINE_UNAVAILABLE' || /Executable doesn't exist|install/i.test(err.message || '')) {
      available = false;
    } else {
      throw err;
    }
  }
});

afterAll(async () => {
  if (provider) await provider.close();
});

describe('browser tier with REAL Chromium', () => {
  it('scrapes and normalizes DOM rows through the full provider chain', async () => {
    if (!available) {
      console.warn('chromium binary not installed — skipping real browser test');
      return;
    }
    const adapter = createBrowserScrapeAdapter({
      browserProvider: provider,
      resolveUrl: () => PAGE,
      extractItems,
      keyOf: (it) => it.externalId,
      maxScrolls: 2
    });
    const scrapeProvider = createScrapeProvider({ adapters: { browser: adapter } });
    const { tier, entities } = await scrapeProvider.scrape({
      platform: 'instagram',
      targetType: 'followers',
      target: 'acme',
      routing: { needsLogin: true } // -> browser tier
    });
    expect(tier).toBe('browser');
    expect(entities.map((e) => e.data.handle)).toEqual(['@alice', '@bob', '@carol']);
  }, 60000);
});
