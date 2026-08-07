import { selectOffer } from '@acq/procurement';

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
  quantity = 1,
  strategy = 'cheapest',
  maxUnitPriceRub = null,
  confirm = false,
  idempotenceId = null
} = {}) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw seam('PROCUREMENT_QUANTITY_INVALID', `quantity must be a positive integer, got ${quantity}`);
  }
  const vendor = ctx.shopVendorFor(shopId);
  const resolvedShopId = shopId ?? ctx.defaultShopId ?? 'dark.shopping';

  // Search the real inventory (product/list) by PLATFORM (or an explicit query) —
  // NOT platform+country as one phrase, which wouldn't match names like
  // "LinkedIn.com | ... | USA IP". Country is applied client-side by selectOffer.
  const name = query ?? platform ?? undefined;
  const items = await vendor.listProducts({
    name,
    only_in_stock: 1,
    price_to: maxUnitPriceRub ?? undefined,
    quantity_from: quantity
  });

  const offer = selectOffer(items, { country, strategy, quantity, maxUnitPriceRub });
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
    product: { id: offer.id, name: offer.name, price: unitRub, stock: offer.quantity, minimum_order: offer.minimum_order },
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
