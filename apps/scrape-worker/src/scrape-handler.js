import { makeEvent } from '@acq/engine-domain';

// scrape-task consumer (TZ §8.3/§10): route the request through the hybrid
// ScrapeProvider, idempotently upsert the normalized entities by natural key,
// and emit scrape.done. Ports injected via ctx.
export async function scrapeTaskHandler(ctx, payload) {
  const clock = () => ctx.clock.now();
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
