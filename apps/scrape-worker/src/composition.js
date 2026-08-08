import {
  createPuppeteerBrowserProvider,
  createBrowserScrapeAdapter,
  createHttpScrapeAdapter,
  createDeviceScrapeAdapter,
  createApiScrapeAdapter,
  createTelegramBotApiEndpoints,
  createTelegramWebSelectors,
  createInstagramWebSelectors,
  createInstagramDeviceSelectors,
  createBrowserSelectorRegistry,
  createTelegramMtprotoAdapter
} from '@acq/scraping';

// Default browser selector registry: Telegram web (web.telegram.org) AND
// Instagram (instagram.com) selectors are wired so the DEFAULT web scraper
// extracts content out of the box; every OTHER platform stays an honest
// SCRAPE_SELECTORS_UNVERIFIED seam until an operator registers its real URL +
// in-page extractor. Both selector sets are verify-by-fact/overridable — a
// mismatch yields empty rows, never fabricated data. Live IG reads still need an
// authenticated session + residential proxy (the anti-detect stack, §10).
const DEFAULT_BROWSER_SELECTORS = createBrowserSelectorRegistry({
  telegram: createTelegramWebSelectors(),
  instagram: createInstagramWebSelectors()
});

// Scrape-worker tier composition (TZ §10.1). Assembles the hybrid tier adapters
// for the ScrapeProvider. The BROWSER tier (primary) is always wired over a real
// Puppeteer provider + an injectable per-platform selector registry; the HTTP
// and DEVICE tiers are wired only when their config is supplied. Everything is
// injectable so tests fake the engine and the running worker gets real I/O.
export function buildScrapeAdapters({
  browserSelectors = DEFAULT_BROWSER_SELECTORS,
  httpSelectors = null,
  deviceScrape = null,
  apiEndpoints = null,
  telegramBotToken = null,
  telegramApiBase,
  mtprotoClient = null,
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
  // On-device (T2) tier — wired when a device provider is supplied. The row
  // extractor defaults to the Instagram username-roster extractor (app-only
  // follower/liker lists) and is overridable per platform (verify-by-fact).
  if (deviceScrape?.provider) {
    const igDevice = createInstagramDeviceSelectors();
    adapters.device = createDeviceScrapeAdapter({
      provider: deviceScrape.provider,
      extractRows: deviceScrape.extractRows ?? igDevice.extractRows,
      keyOf: deviceScrape.keyOf ?? igDevice.keyOf
    });
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
  // MTProto tier (full history + full roster) — wired only when a client is
  // supplied (api_id/api_hash + user session); otherwise a params.via='mtproto'
  // scrape surfaces the MTPROTO_CLIENT_UNAVAILABLE / SCRAPE_TIER_UNAVAILABLE seam.
  if (mtprotoClient?.getMessages && mtprotoClient?.getParticipants) {
    adapters.mtproto = createTelegramMtprotoAdapter({ client: mtprotoClient });
  }

  return { adapters, browserProvider: provider };
}
