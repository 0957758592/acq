import { parseDelivery, mapAccountFields } from '@acq/integrations';

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

// Fetch a completed order's delivery, parse it, and VAULT each credential — WITHOUT
// inserting. Returns pool-ready account objects. Shared by the shop.deliver op and
// the autonomous keystore adapter (which lets acquireHandler do the insert). Calling
// order/download here is the API equivalent of "opening order details" on the web —
// on a not-ready order it raises a RETRYABLE seam so the job re-views on each retry.
export async function buildDeliveredAccounts(ctx, { shopId, orderId, platform } = {}) {
  if (orderId === undefined || orderId === null || orderId === '') throw seam('ORDER_ID_REQUIRED', 'orderId is required');
  if (!platform) throw seam('PLATFORM_REQUIRED', 'platform is required');
  if (!ctx.credentialVault) throw seam('CREDENTIAL_VAULT_UNAVAILABLE', 'no credential vault wired — refusing to store plaintext credentials');

  const vendor = ctx.shopVendorFor(shopId);
  const resolvedShopId = shopId ?? ctx.defaultShopId ?? 'dark.shopping';

  let link;
  try {
    ({ link } = await vendor.getOrderDownload(orderId));
  } catch (err) {
    // "not ready to download" -> retryable: the delivery is still being fulfilled.
    throw Object.assign(seam('DELIVERY_NOT_READY', `order ${orderId} not ready: ${err.message}`), { retryable: true, cause: err });
  }
  if (!link) throw Object.assign(seam('DELIVERY_NOT_READY', `order ${orderId} has no delivery link yet`), { retryable: true });
  const raw = await vendor.fetchDelivered(link);
  const parsed = parseDelivery(raw);

  const vault = (v) => (v == null ? undefined : ctx.credentialVault.put(v));
  const accounts = [];
  for (const acc of parsed) {
    const creds = mapAccountFields(acc.secrets.fields);
    // Structured, individually-vaulted login fields (so bring-online resolves
    // username/password directly) PLUS the whole raw line (nothing lost, encrypted).
    accounts.push({
      platform,
      identifier: acc.identifier,
      source: 'purchase',
      shopId: resolvedShopId,
      secretRefs: {
        username: await vault(creds.username),
        password: await vault(creds.password),
        email: await vault(creds.email),
        credential: await vault(acc.secrets.raw)
      },
      acquisition: { separator: acc.separator, fieldCount: acc.fieldCount }
    });
  }
  return { accounts, shopId: resolvedShopId };
}

export async function shopDeliver(ctx, { shopId, orderId, platform } = {}) {
  const { accounts, shopId: resolvedShopId } = await buildDeliveredAccounts(ctx, { shopId, orderId, platform });
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
