import { validateShopSpec } from '@acq/procurement';
import { domainError } from '@acq/engine-domain';

// Shop scan pipeline (TZ §6.3): SCAN (AI proposes) -> VALIDATE (deterministic
// JSON-schema + optional dry-run against the real shop) -> register UNVERIFIED.
// APPROVE (flip verified) stays a separate human/admin step (shop.approve). The
// scanner is injected; without it this is an honest coded seam. Junk specs are
// rejected by validateShopSpec and never registered.
export async function scanShop(ctx, { shopUrl, dryRun = false, scanner = null } = {}) {
  const shopScanner = scanner ?? ctx.shopScanner;
  if (!shopScanner) throw domainError('SHOP_SCANNER_UNAVAILABLE', 'no shop scanner wired (LLM required)');
  if (!shopUrl) throw domainError('SHOP_URL_REQUIRED', 'shopUrl is required');

  const draft = await shopScanner.propose({ shopUrl });
  const validated = validateShopSpec(draft); // throws SHOP_SPEC_INVALID on bad shape

  let dryRunResult = null;
  if (dryRun) {
    try {
      const adapter = ctx.compileShopAdapter({ ...validated, verified: true }, {
        httpClient: ctx.httpClient,
        secretResolver: ctx.secretResolver,
        config: {}
      });
      const balance = await adapter.getBalance();
      dryRunResult = { ok: true, balanceUsdCents: balance.balanceUsdCents };
    } catch (err) {
      dryRunResult = { ok: false, error: err.code ? `${err.code}: ${err.message}` : err.message };
    }
  }

  const stored = await ctx.shopRegistry.register(validated); // always UNVERIFIED
  return { shopId: stored.shopId, verified: false, ...(dryRunResult ? { dryRun: dryRunResult } : {}) };
}
