import { makeEvent } from '@acq/engine-domain';

import { resolveResidentialProxy } from './services/resolve-residential-proxy.js';

// scrape-task consumer (TZ §8.3/§10): route the request through the hybrid
// ScrapeProvider, idempotently upsert the normalized entities by natural key,
// and emit scrape.done. Ports injected via ctx.
export async function scrapeTaskHandler(ctx, payload) {
  const clock = () => ctx.clock.now();
  // Auto-pick a residential proxy from the pool for the scrape when asked
  // (`params.useResidential`), unless an explicit proxy was supplied. Resolved
  // just-in-time here so the credential never travels through the queue.
  if (payload?.params?.useResidential && !payload.params.proxy) {
    const { proxy } = await resolveResidentialProxy(ctx, { geo: payload.params.geo });
    payload = { ...payload, params: { ...payload.params, proxy } };
  }
  let tier;
  let entities;
  try {
    ({ tier, entities } = await ctx.scrapeProvider.scrape(payload));
  } catch (err) {
    // A captcha wall is a §15 observability signal AND a hard stop — count it,
    // then propagate unchanged (never solved blind).
    if (err?.code === 'SCRAPE_CAPTCHA') {
      ctx.domainMetrics?.recordCaptcha?.({ platform: payload?.platform, tier: payload?.params?.via ?? 'browser' });
    }
    throw err;
  }
  const { upserted } = await ctx.scrapeResultRepo.upsertResults(entities);
  await ctx.eventBus.publish(
    makeEvent('scrape.done', { platform: payload.platform, targetType: payload.targetType, target: payload.target, tier, count: entities.length }, { clock })
  );
  return { tier, upserted: upserted ?? entities.length };
}
