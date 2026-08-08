/**
 * ScrapeProvider port (TZ §4/§10.1):
 * @typedef {Object} ScrapeProvider
 * @property {(req: { platform: string, targetType: string, target: string, params?: Object, routing?: Object }) => Promise<{ tier: string, entities: Object[] }>} scrape
 */
export { SCRAPE_TIERS, selectTier } from './tier-router.js';
export { normalizeEntities, naturalKey } from './read-models.js';
export { extractEmbeddedJson } from './embedded-json.js';
export { createScrapeProvider } from './scrape-provider.js';
export { createHttpScrapeAdapter } from './adapters/http-scrape-adapter.js';
export { createDeviceScrapeAdapter } from './adapters/device-scrape-adapter.js';
export { createApiScrapeAdapter } from './adapters/api-scrape-adapter.js';
export { createTelegramBotApiEndpoints } from './adapters/telegram-bot-api.js';
export { createTelegramWebSelectors, createBrowserSelectorRegistry } from './adapters/telegram-web-selectors.js';
export { createInstagramWebSelectors } from './adapters/instagram-web-selectors.js';
export { createInstagramDeviceSelectors } from './adapters/instagram-device-selectors.js';
export { targetsFromEntities } from './targets-from-entities.js';
export { createTelegramMtprotoAdapter } from './adapters/telegram-mtproto.js';
export { createBrowserScrapeAdapter } from './adapters/browser-scrape-adapter.js';
export { createPuppeteerBrowserProvider } from './adapters/puppeteer-browser-provider.js';
