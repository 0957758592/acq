import { makeEvent } from '@acq/engine-domain';

// Generic acquire consumer (TZ §8.3) — buys OR generates accounts for ANY
// platform, from ANY shop. Reuses @acq/procurement (compileShopAdapter +
// ShopRegistry) and @acq/account-gen (AccountGenerator) — no duplicated buy
// logic. Fails safe (coded error) when no verified shop / no generator, never
// guessing. Delivered secrets are already vaulted by the compiled adapter.
function seam(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export async function acquireHandler(ctx, { platform, source = 'purchase', quantity, shopId, deviceId, niche, locale }) {
  const clock = () => ctx.clock.now();

  if (source === 'generate') {
    if (!ctx.accountGenerator) throw seam('GENERATION_UNAVAILABLE', `no account generator for ${platform}`);
    const accounts = await ctx.accountGenerator.generate({ platform, count: quantity, deviceId, niche, locale });
    await ctx.accountRepo.insertAcquired(accounts, { orderId: `gen:${platform}` });
    await ctx.eventBus?.publish?.(makeEvent('account.acquired', { platform, count: accounts.length, source }, { clock }));
    return { acquired: accounts.length, source };
  }

  // Purchase: select a VERIFIED shop and compile a deterministic PurchaseAdapter.
  const shop = shopId ? await ctx.shopRegistry.get(shopId) : await ctx.shopRegistry.selectForPlatform(platform, {
    maxUnitPriceUsdCents: ctx.config?.maxUnitPriceUsdCents ?? null
  });
  if (!shop || !shop.verified) {
    throw seam('SHOP_SPEC_UNVERIFIED', `no verified shop for ${platform}`);
  }

  // The ShopRegistry doc-level `verified` (flipped by approve()) is the source of
  // truth; the embedded spec.verified can be stale from registration. Compile
  // with the authoritative flag so an approved shop actually executes.
  const adapter = ctx.compileShopAdapter({ ...shop.spec, verified: true }, {
    httpClient: ctx.httpClient,
    secretResolver: ctx.secretResolver,
    config: {
      expectedUnitUsdCents: shop.unitPriceUsdCents ?? ctx.config?.expectedUnitUsdCents,
      priceDriftTolerance: ctx.config?.priceDriftTolerance,
      maxTotalUsdCents: ctx.config?.maxTotalUsdCents
    }
  });

  const { orderId, amountUsdCents } = await adapter.purchase(quantity);
  const delivered = await adapter.fetchDelivered({ orderId });
  await ctx.accountRepo.insertAcquired(delivered, { orderId });
  await ctx.expenseRecorder?.record?.({ provider: shop.shopId, externalReference: orderId, amountUsdCents, platform });
  await ctx.eventBus?.publish?.(makeEvent('purchase.completed', { platform, shopId: shop.shopId, orderId, count: delivered.length }, { clock }));
  return { acquired: delivered.length, orderId, source: 'purchase' };
}
