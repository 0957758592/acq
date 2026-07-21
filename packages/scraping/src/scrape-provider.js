import { domainError } from '@acq/engine-domain';

import { selectTier } from './tier-router.js';
import { normalizeEntities } from './read-models.js';

// Hybrid ScrapeProvider (TZ §10.1): routes a scrape request to a tier adapter
// (browser / http / device / api), then reduces the raw output to normalized
// read-models. Tier adapters are injected (their live I/O lives outside the
// domain); a captcha wall is a hard-stop that propagates unchanged (§10.3).
export function createScrapeProvider({ adapters = {} } = {}) {
  async function scrape({ platform, targetType, target, params = {}, routing = {} }) {
    const tier = selectTier(routing);
    const adapter = adapters[tier];
    if (!adapter) {
      throw domainError('SCRAPE_TIER_UNAVAILABLE', `no adapter for scrape tier '${tier}'`);
    }
    const { rawItems = [] } = await adapter.scrape({ platform, targetType, target, params });
    const entities = normalizeEntities({ platform, targetType, target, rawItems });
    return { tier, entities };
  }

  return { scrape };
}
