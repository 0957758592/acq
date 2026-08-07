import { shopDeliver } from './shop-deliver.js';

function ctxWith({ raw }) {
  const inserted = [];
  return {
    inserted,
    defaultShopId: 'dark.shopping',
    shopVendorFor: () => ({
      getOrderDownload: async (id) => ({ link: `https://dark.shopping/storage/${id}.txt` }),
      fetchDelivered: async () => raw
    }),
    credentialVault: { put: async (v) => 'vault:' + Buffer.from(String(v)).toString('base64') },
    accountRepo: { insertAcquired: async (accs, opts) => { inserted.push({ accs, opts }); return accs; } }
  };
}

test('fetches the order, parses, VAULTS credentials, and inserts into the pool', async () => {
  const ctx = ctxWith({ raw: 'user1:pass1:mail@x.com\nuser2:pass2:mail2@x.com' });
  const res = await shopDeliver(ctx, { orderId: 123, platform: 'instagram' });

  expect(res.imported).toBe(2);
  expect(res.platform).toBe('instagram');
  const { accs, opts } = ctx.inserted[0];
  expect(opts.orderId).toBe(123);
  expect(accs[0]).toMatchObject({ platform: 'instagram', source: 'purchase', shopId: 'dark.shopping', identifier: 'user1' });
  // credential is vaulted (ciphertext ref), never plaintext
  expect(accs[0].secretRefs.credential).toMatch(/^vault:/);
  expect(accs[0].secretRefs.credential).not.toContain('pass1');
  // delivery shape metadata is recorded for later per-product field mapping
  expect(accs[0].acquisition).toMatchObject({ separator: ':', fieldCount: 3 });
});

test('no vault wired -> coded seam, never stores plaintext', async () => {
  const ctx = { ...ctxWith({ raw: 'a:b:c' }), credentialVault: null };
  await expect(shopDeliver(ctx, { orderId: 1, platform: 'instagram' })).rejects.toMatchObject({ code: 'CREDENTIAL_VAULT_UNAVAILABLE' });
  expect(ctx.inserted).toHaveLength(0);
});

test('empty delivery -> imported 0, nothing inserted', async () => {
  const ctx = ctxWith({ raw: '' });
  const res = await shopDeliver(ctx, { orderId: 9, platform: 'instagram' });
  expect(res.imported).toBe(0);
  expect(ctx.inserted).toHaveLength(0);
});

test('requires orderId and platform', async () => {
  const ctx = ctxWith({ raw: 'a:b' });
  await expect(shopDeliver(ctx, { platform: 'instagram' })).rejects.toMatchObject({ code: 'ORDER_ID_REQUIRED' });
  await expect(shopDeliver(ctx, { orderId: 1 })).rejects.toMatchObject({ code: 'PLATFORM_REQUIRED' });
});
