import { makeEvent } from '@acq/engine-domain';

// scrape-task consumer (TZ §8.3/§10): route the request through the hybrid
// ScrapeProvider, idempotently upsert the normalized entities by natural key,
// and emit scrape.done. Ports injected via ctx.
export async function scrapeTaskHandler(ctx, payload) {
  const clock = () => ctx.clock.now();
  const { tier, entities } = await ctx.scrapeProvider.scrape(payload);
  const { upserted } = await ctx.scrapeResultRepo.upsertResults(entities);
  await ctx.eventBus.publish(
    makeEvent('scrape.done', { platform: payload.platform, targetType: payload.targetType, target: payload.target, tier, count: entities.length }, { clock })
  );
  return { tier, upserted: upserted ?? entities.length };
}
