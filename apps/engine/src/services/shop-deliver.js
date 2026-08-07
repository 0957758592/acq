import { parseDelivery } from '@acq/integrations';

// Deliver-and-import step for reseller (keystore-api) purchases (TZ §6/§8.3).
// Given a COMPLETED order, fetch its delivery (order/download link), parse the
// blob into account candidates, VAULT each credential (encrypted at rest — never
// plaintext), and insert them into the pool as `acquired`. This is the async tail
// of the money path: the autonomous acquire job calls it once order/status is
// completed; it is also exposed as shop.deliver on every surface. Idempotency:
// insertAcquired carries the orderId; a re-run re-imports the same order's items.
function seam(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export async function shopDeliver(ctx, { shopId, orderId, platform } = {}) {
  if (orderId === undefined || orderId === null || orderId === '') throw seam('ORDER_ID_REQUIRED', 'orderId is required');
  if (!platform) throw seam('PLATFORM_REQUIRED', 'platform is required');
  if (!ctx.credentialVault) throw seam('CREDENTIAL_VAULT_UNAVAILABLE', 'no credential vault wired — refusing to store plaintext credentials');

  const vendor = ctx.shopVendorFor(shopId);
  const resolvedShopId = shopId ?? ctx.defaultShopId ?? 'dark.shopping';

  const { link } = await vendor.getOrderDownload(orderId);
  if (!link) throw seam('DELIVERY_NOT_READY', `order ${orderId} has no delivery link yet`);
  const raw = await vendor.fetchDelivered(link);
  const parsed = parseDelivery(raw);

  const accounts = [];
  for (const acc of parsed) {
    accounts.push({
      platform,
      identifier: acc.identifier,
      source: 'purchase',
      shopId: resolvedShopId,
      // The whole delivered line, encrypted at rest. Field semantics vary per
      // product, so we keep the raw credential + its shape for per-product mapping
      // at bring-online (never guess/mislabel here).
      secretRefs: { credential: await ctx.credentialVault.put(acc.secrets.raw) },
      acquisition: { separator: acc.separator, fieldCount: acc.fieldCount }
    });
  }
  if (accounts.length) await ctx.accountRepo.insertAcquired(accounts, { orderId });

  return {
    imported: accounts.length,
    platform,
    shopId: resolvedShopId,
    orderId,
    // masked identifiers for the response (no secrets leave the vault)
    identifiers: accounts.map((a) => maskId(a.identifier))
  };
}

function maskId(v) {
  const s = String(v ?? '');
  return s.length <= 3 ? `${s[0] ?? ''}**` : `${s.slice(0, 2)}${'*'.repeat(Math.min(5, s.length - 3))}${s.slice(-1)}`;
}
