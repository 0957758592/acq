import { makeEvent } from '@acq/engine-domain';
import { targetsFromEntities } from '@acq/scraping';
import { normalizeTelemetryEvent } from '@acq/core/observability/telemetry';

import { resolveResidentialProxy } from './services/resolve-residential-proxy.js';

// Best-effort telemetry emission — never let a telemetry write break the scrape
// hot path (defensive, like domainMetrics). ctx.telemetryRepo is optional.
async function emitTelemetry(ctx, event) {
  try {
    if (!ctx.telemetryRepo?.recordMany) return;
    await ctx.telemetryRepo.recordMany([normalizeTelemetryEvent(event, { clock: ctx.clock })]);
  } catch { /* telemetry is observ-only; swallow */ }
}

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
  const startedAt = ctx.clock.now();
  const via = payload?.params?.via ?? 'browser';
  let tier;
  let entities;
  try {
    ({ tier, entities } = await ctx.scrapeProvider.scrape(payload));
  } catch (err) {
    // A captcha wall is a §15 observability signal AND a hard stop — count it,
    // then propagate unchanged (never solved blind).
    const captcha = err?.code === 'SCRAPE_CAPTCHA';
    if (captcha) ctx.domainMetrics?.recordCaptcha?.({ platform: payload?.platform, tier: via });
    // Record a FAILED parser telemetry event for every scrape error (§10/§15).
    await emitTelemetry(ctx, {
      platform: payload?.platform, kind: `scrape.${payload?.targetType}`, source: 'scrape', target: payload?.target, tier: via, outcome: 'failed',
      metrics: { errors: 1, captchas: captcha ? 1 : 0, latencyMs: ctx.clock.now() - startedAt }
    });
    throw err;
  }
  const { upserted } = await ctx.scrapeResultRepo.upsertResults(entities);
  // Feed the callable targets DB (§3.5/§10.5): discovered actors/posts become
  // targets the AI/campaigns can act on. Best-effort — never breaks the scrape.
  try {
    const targets = targetsFromEntities(entities);
    if (targets.length && ctx.targetRepo?.upsertMany) await ctx.targetRepo.upsertMany(targets);
  } catch { /* targets enrichment is best-effort */ }
  // Parser telemetry: what this scrape PRODUCED (§10/§15) — itemsOut + tier + latency.
  await emitTelemetry(ctx, {
    platform: payload.platform, kind: `scrape.${payload.targetType}`, source: 'scrape', target: payload.target, tier, outcome: 'ok',
    metrics: { itemsOut: entities.length, upserted: upserted ?? entities.length, latencyMs: ctx.clock.now() - startedAt }
  });
  await ctx.eventBus.publish(
    makeEvent('scrape.done', { platform: payload.platform, targetType: payload.targetType, target: payload.target, tier, count: entities.length }, { clock })
  );
  return { tier, upserted: upserted ?? entities.length };
}
