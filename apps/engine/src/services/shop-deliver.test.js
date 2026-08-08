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
  // structured login fields + the raw credential, all vaulted (ciphertext), never plaintext
  expect(accs[0].secretRefs.username).toMatch(/^vault:/);
  expect(accs[0].secretRefs.password).toMatch(/^vault:/);
  expect(accs[0].secretRefs.email).toMatch(/^vault:/);
  expect(accs[0].secretRefs.credential).toMatch(/^vault:/);
  expect(JSON.stringify(accs[0].secretRefs)).not.toContain('pass1');
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

test('routes a telegram order to the Drive-session path and inserts the mtproto account', async () => {
  const DRIVE_HTML = `<script>window['_DRIVE_ivd'] = '\\x5b\\x5b\\x5b\\x22FID_JSON\\x22,\\x5b\\x22P\\x22\\x5d,\\x22+14504891347.json\\x22,\\x22application\\/json\\x22\\x5d\\x5d\\x5d';</script>`;
  const SESSION_JSON = JSON.stringify({ phone: '+14504891347', user_id: '84879', api_id: 2040, api_hash: 'hh', password: 'Ra821', alpha_2: 'CA', session_string: '1AZ' });
  const ctx = ctxWith({ raw: 'https://drive.google.com/drive/folders/FLD?usp=sharing,' });
  ctx.fetchText = async (url) => (url.includes('/drive/folders/FLD') ? DRIVE_HTML : url.includes('id=FID_JSON') ? SESSION_JSON : (() => { throw new Error('x'); })());

  const res = await shopDeliver(ctx, { orderId: 7961005, platform: 'telegram' });
  expect(res.imported).toBe(1);
  const { accs, opts } = ctx.inserted[0];
  expect(opts.orderId).toBe(7961005);
  expect(accs[0]).toMatchObject({ platform: 'telegram', identifier: '+14504891347', profile: { apiId: 2040, mtproto: true } });
  expect(accs[0].secretRefs.session).toMatch(/^vault:/);
  expect(JSON.stringify(accs[0])).not.toContain('1AZ'); // session vaulted, never plaintext
});
