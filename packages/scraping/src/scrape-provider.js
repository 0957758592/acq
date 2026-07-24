import { domainError } from '@acq/engine-domain';

import { selectTier } from './tier-router.js';
import { normalizeEntities } from './read-models.js';

// Hybrid ScrapeProvider (TZ §10.1): routes a scrape request to a tier adapter
// (browser / http / device / api), then reduces the raw output to normalized
// read-models. Tier adapters are injected (their live I/O lives outside the
// domain); a captcha wall is a hard-stop that propagates unchanged (§10.3).
export function createScrapeProvider({ adapters = {} } = {}) {
  async function scrape({ platform, targetType, target, params = {}, routing = {} }) {
    // Browser (web) is the DEFAULT tier. A caller OPTS IN to a specific tier
    // per-request via params.via — no default change:
    //   'bot-api'  -> Telegram Bot API (api tier)
    //   'mtproto'  -> Telegram MTProto full-history/roster (mtproto tier)
    const VIA_TIER = { 'bot-api': 'api', mtproto: 'mtproto' };
    const tier = VIA_TIER[params.via] ?? selectTier(routing);
    const adapter = adapters[tier];
    if (!adapter) {
      throw domainError('SCRAPE_TIER_UNAVAILABLE', `no adapter for scrape tier '${tier}'`);
    }
    const result = await adapter.scrape({ platform, targetType, target, params });
    // Captcha is a hard-stop verify-by-fact seam (§10.3/§22.2): never solved
    // blind. An adapter that hit a captcha signals it; we fail with a coded error.
    if (result?.captcha) {
      throw domainError('SCRAPE_CAPTCHA', `captcha wall on ${platform}/${targetType} via ${tier}`);
    }
    const entities = normalizeEntities({ platform, targetType, target, rawItems: result?.rawItems ?? [] });
    return { tier, entities };
  }

  return { scrape };
}
