import {
  createPuppeteerBrowserProvider,
  createBrowserScrapeAdapter,
  createHttpScrapeAdapter,
  createDeviceScrapeAdapter
} from '@acq/scraping';

// An empty selector registry — the verify-by-fact default. Every platform is
// unverified until an operator registers its real URL + in-page extractor, so
// a scrape of an unconfigured platform is an honest coded seam, never a guess.
const EMPTY_REGISTRY = { forPlatform: () => null };

// Scrape-worker tier composition (TZ §10.1). Assembles the hybrid tier adapters
// for the ScrapeProvider. The BROWSER tier (primary) is always wired over a real
// Playwright provider + an injectable per-platform selector registry; the HTTP
// and DEVICE tiers are wired only when their config is supplied. Everything is
// injectable so tests fake the engine and the running worker gets real I/O.
export function buildScrapeAdapters({
  browserSelectors = EMPTY_REGISTRY,
  httpSelectors = null,
  deviceScrape = null,
  browserProvider = null,
  maxConcurrency = 4
} = {}) {
  const provider = browserProvider ?? createPuppeteerBrowserProvider({ maxConcurrency });
  const adapters = {
    browser: createBrowserScrapeAdapter({ browserProvider: provider, selectorRegistry: browserSelectors })
  };

  if (httpSelectors?.resolveUrl && httpSelectors?.pickItems) {
    adapters.http = createHttpScrapeAdapter({ resolveUrl: httpSelectors.resolveUrl, pickItems: httpSelectors.pickItems });
  }
  if (deviceScrape?.provider && deviceScrape?.extractRows) {
    adapters.device = createDeviceScrapeAdapter({ provider: deviceScrape.provider, extractRows: deviceScrape.extractRows, keyOf: deviceScrape.keyOf });
  }

  return { adapters, browserProvider: provider };
}
