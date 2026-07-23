import { scanShop } from './scan-shop.js';

const validDraft = {
  shopId: 'scanned', baseUrl: 'https://s.example', title: 'S', platform: 'telegram',
  auth: { kind: 'api-key', config: {} },
  endpoints: {
    balance: { method: 'GET', path: '/b', responseMap: {} },
    offers: { method: 'GET', path: '/o', responseMap: {} },
    purchase: { method: 'POST', path: '/p', responseMap: {} },
    delivery: { method: 'POST', path: '/d', responseMap: {}, deliveryFormat: { format: 'json-array', itemMap: { identifier: 'x' } } }
  },
  verified: false
};

function fakeCtx({ draft = validDraft, dryRunBalance } = {}) {
  const registered = [];
  return {
    registered,
    shopScanner: { propose: async ({ shopUrl }) => ({ ...draft, baseUrl: shopUrl }) },
    shopRegistry: { register: async (spec) => { registered.push(spec); return { shopId: spec.shopId, verified: false }; } },
    httpClient: {},
    secretResolver: { resolve: async (r) => r, put: async (n) => `env:${n}` },
    compileShopAdapter: () => ({ getBalance: async () => ({ balanceUsdCents: dryRunBalance ?? 5000 }) }),
    config: {}
  };
}

describe('scanShop pipeline (SCAN -> VALIDATE -> register UNVERIFIED)', () => {
  it('proposes via the scanner, validates deterministically, and registers the spec UNVERIFIED', async () => {
    const ctx = fakeCtx();
    const res = await scanShop(ctx, { shopUrl: 'https://s.example' });
    expect(res).toMatchObject({ shopId: 'scanned', verified: false });
    expect(ctx.registered[0].verified).toBe(false);
  });

  it('rejects an invalid proposed spec with SHOP_SPEC_INVALID (never registers junk)', async () => {
    const ctx = fakeCtx({ draft: { shopId: 'bad' } }); // missing required fields
    await expect(scanShop(ctx, { shopUrl: 'https://s.example' })).rejects.toMatchObject({ code: 'SHOP_SPEC_INVALID' });
    expect(ctx.registered).toHaveLength(0);
  });

  it('runs a dry-run against the real shop when requested (reachability check)', async () => {
    const ctx = fakeCtx({ dryRunBalance: 9000 });
    const res = await scanShop(ctx, { shopUrl: 'https://s.example', dryRun: true });
    expect(res.dryRun).toMatchObject({ ok: true, balanceUsdCents: 9000 });
  });

  it('reports a failed dry-run without throwing (spec still registered unverified)', async () => {
    const ctx = fakeCtx();
    ctx.compileShopAdapter = () => ({ getBalance: async () => { throw new Error('402 no balance'); } });
    const res = await scanShop(ctx, { shopUrl: 'https://s.example', dryRun: true });
    expect(res.dryRun.ok).toBe(false);
    expect(ctx.registered).toHaveLength(1);
  });

  it('fails safe with SHOP_SCANNER_UNAVAILABLE when no scanner is wired', async () => {
    const ctx = fakeCtx();
    ctx.shopScanner = null;
    await expect(scanShop(ctx, { shopUrl: 'https://s.example' })).rejects.toMatchObject({ code: 'SHOP_SCANNER_UNAVAILABLE' });
  });
});
