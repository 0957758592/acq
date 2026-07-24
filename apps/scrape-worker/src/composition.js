import {
  createPuppeteerBrowserProvider,
  createBrowserScrapeAdapter,
  createHttpScrapeAdapter,
  createDeviceScrapeAdapter,
  createApiScrapeAdapter,
  createTelegramBotApiEndpoints
} from '@acq/scraping';

// An empty selector registry — the verify-by-fact default. Every platform is
// unverified until an operator registers its real URL + in-page extractor, so
// a scrape of an unconfigured platform is an honest coded seam, never a guess.
const EMPTY_REGISTRY = { forPlatform: () => null };

// Scrape-worker tier composition (TZ §10.1). Assembles the hybrid tier adapters
// for the ScrapeProvider. The BROWSER tier (primary) is always wired over a real
// Puppeteer provider + an injectable per-platform selector registry; the HTTP
// and DEVICE tiers are wired only when their config is supplied. Everything is
// injectable so tests fake the engine and the running worker gets real I/O.
export function buildScrapeAdapters({
  browserSelectors = EMPTY_REGISTRY,
  httpSelectors = null,
  deviceScrape = null,
  apiEndpoints = null,
  telegramBotToken = null,
  telegramApiBase,
  browserProvider = null,
  maxConcurrency = 4
} = {}) {
  // Telegram Bot API api-tier registry — wired only when a bot token is supplied
  // (opt-in). The browser (web) tier stays the default; callers reach this by
  // passing params.via='bot-api'. An explicit apiEndpoints still takes priority.
  const resolvedApiEndpoints =
    apiEndpoints ?? (telegramBotToken ? createTelegramBotApiEndpoints({ botToken: telegramBotToken, apiBase: telegramApiBase }) : null);
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
  // T3 api tier — wired when a per-platform endpoint registry (or resolver) is
  // supplied; otherwise absent (an api-routed scrape then surfaces the tier seam).
  if (resolvedApiEndpoints?.forPlatform || (resolvedApiEndpoints?.resolveEndpoint && resolvedApiEndpoints?.pickItems)) {
    adapters.api = createApiScrapeAdapter(
      resolvedApiEndpoints.forPlatform
        ? { endpointRegistry: resolvedApiEndpoints }
        : { resolveEndpoint: resolvedApiEndpoints.resolveEndpoint, pickItems: resolvedApiEndpoints.pickItems }
    );
  }

  return { adapters, browserProvider: provider };
}
