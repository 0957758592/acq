import { selectOffer, buyPolicyFor } from '@acq/procurement';

// Search-driven purchase orchestration for reseller (keystore-api) shops, e.g.
// dark.shopping (TZ §6.5/§8.3). Flow: product/list SEARCH -> selectOffer (buy
// policy) -> balance + guards -> [confirm] order/create by product id. Money is
// spent ONLY when confirm===true; otherwise it returns a dry PLAN (what it would
// buy + projected balance) so the brain/operator can approve first — one op,
// every surface. Delivery import (.txt) is a downstream verify-by-fact seam.
function seam(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export async function shopBuy(ctx, {
  shopId,
  platform,
  country,
  query,
  categoryId,
  quantity = 1,
  strategy = 'cheapest',
  maxUnitPriceRub = null,
  minRating = null,
  maxInvalidPercent = null,
  includeGroups,
  excludeGroups,
  excludeNames,
  confirm = false,
  idempotenceId = null
} = {}) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw seam('PROCUREMENT_QUANTITY_INVALID', `quantity must be a positive integer, got ${quantity}`);
  }
  const vendor = ctx.shopVendorFor(shopId);
  const resolvedShopId = shopId ?? ctx.defaultShopId ?? 'dark.shopping';

  // Buy policy (vendor taxonomy) scopes the search to real ACCOUNTS: a category id
  // per platform + group/name filters (e.g. Telegram accounts not Stars; real
  // @gmail.com not .edu). Every field is overridable per call.
  const policy = buyPolicyFor(resolvedShopId, platform);
  const cat = categoryId ?? policy.categoryId ?? null;

  // Prefer category scoping (precise); fall back to a name search by query/platform.
  // Country is applied client-side by selectOffer (names embed it, e.g. "USA IP").
  const searchParams = { only_in_stock: 1, price_to: maxUnitPriceRub ?? undefined, quantity_from: quantity };
  if (query) searchParams.name = query;
  else if (cat) searchParams.category_id = cat;
  else if (platform) searchParams.name = platform;
  const items = await vendor.listProducts(searchParams);

  // Some platforms (e.g. Gmail) don't tag accounts by country — policy drops it.
  const effectiveCountry = policy.ignoreCountry ? undefined : country;
  const offer = selectOffer(items, {
    country: effectiveCountry, strategy, quantity, maxUnitPriceRub,
    minRating: minRating ?? policy.minRating ?? null,
    maxInvalidPercent: maxInvalidPercent ?? policy.maxInvalidPercent ?? null,
    includeGroups: includeGroups ?? policy.includeGroups ?? null,
    excludeGroups: excludeGroups ?? policy.excludeGroups ?? null,
    excludeNames: excludeNames ?? policy.excludeNames ?? null
  });
  if (!offer) {
    throw seam('NO_MATCHING_OFFER', `no in-stock offer for ${platform ?? query ?? '(any)'} ${country ?? ''}`.trim());
  }

  const bal = await vendor.getBalance();
  const balanceRub = Number(bal.balance);
  const unitRub = Number(offer.price);
  const totalRub = Number((unitRub * quantity).toFixed(4));
  const rubPerUsd = ctx.config?.rubPerUsd ?? null;
  const toUsdCents = (rub) => (rubPerUsd && Number.isFinite(rub) ? Math.round((rub / rubPerUsd) * 100) : null);

  const plan = {
    shopId: resolvedShopId,
    platform: platform ?? null,
    country: country ?? null,
    product: { id: offer.id, name: offer.name, group: offer.group?.name ?? null, price: unitRub, stock: offer.quantity, minimum_order: offer.minimum_order, rating: offer.rating ?? null, invalidPercent: offer.invalid_items_percent ?? null },
    quantity,
    unitRub,
    totalRub,
    currency: bal.currency,
    balanceRub,
    balanceAfterRub: Number((balanceRub - totalRub).toFixed(4)),
    totalUsdCents: toUsdCents(totalRub),
    balanceUsdCents: toUsdCents(balanceRub),
    affordable: Number.isFinite(balanceRub) && balanceRub >= totalRub
  };

  // Dry run — report the plan, spend nothing. This is the approval surface.
  if (!confirm) return { confirmed: false, plan };

  // === MONEY PATH (confirm===true) ===
  if (!plan.affordable) {
    throw seam('PROCUREMENT_INSUFFICIENT_BALANCE', `total ${totalRub} ${bal.currency} > balance ${balanceRub} ${bal.currency}`);
  }
  const order = await vendor.createOrder({ product: offer.id, quantity, idempotenceId });
  return {
    confirmed: true,
    plan,
    order: { status: order.status, orderId: order.id, link: order.link ?? null, idempotence: Boolean(order.idempotence) }
  };
}
