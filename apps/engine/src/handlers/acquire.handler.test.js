import { acquireHandler } from './acquire.handler.js';

const clock = { now: () => new Date('2026-07-22T18:00:00.000Z') };

function fakeCtx({ shop, generator } = {}) {
  const inserted = [];
  const events = [];
  const expenses = [];
  return {
    inserted,
    events,
    expenses,
    clock,
    accountRepo: { insertAcquired: async (accts, opts) => { inserted.push({ accts, opts }); return accts; } },
    shopRegistry: { selectForPlatform: async () => shop, get: async () => shop },
    // Reuses the real procurement compiler shape (injected here as a fake adapter).
    compileShopAdapter: () => ({
      purchase: async (q) => ({ orderId: 'ORD-9', amountUsdCents: q * 100 }),
      fetchDelivered: async () => [
        { identifier: '@d1', platform: 'telegram', source: 'purchase', secretRefs: {} },
        { identifier: '@d2', platform: 'telegram', source: 'purchase', secretRefs: {} }
      ]
    }),
    httpClient: {},
    secretResolver: {},
    accountGenerator: generator,
    expenseRecorder: { record: async (e) => expenses.push(e) },
    eventBus: { publish: async (e) => events.push(e.type) },
    config: { expectedUnitUsdCents: 100 }
  };
}

describe('generic acquireHandler', () => {
  it('purchase path: compiles the verified shop adapter, buys, inserts delivered accounts', async () => {
    const ctx = fakeCtx({ shop: { shopId: 's1', verified: true, spec: {}, unitPriceUsdCents: 100 } });
    const res = await acquireHandler(ctx, { platform: 'telegram', source: 'purchase', quantity: 2 });
    expect(res).toMatchObject({ acquired: 2, orderId: 'ORD-9', source: 'purchase' });
    expect(ctx.inserted[0].accts).toHaveLength(2);
    expect(ctx.events).toContain('purchase.completed');
    expect(ctx.expenses).toHaveLength(1);
  });

  it('compiles the shop with the authoritative verified flag (doc-level, even if spec.verified is stale false)', async () => {
    const ctx = fakeCtx({ shop: { shopId: 's1', verified: true, spec: { shopId: 's1', verified: false }, unitPriceUsdCents: 100 } });
    let compiledSpec;
    ctx.compileShopAdapter = (spec) => {
      compiledSpec = spec;
      return { purchase: async () => ({ orderId: 'O', amountUsdCents: 100 }), fetchDelivered: async () => [] };
    };
    await acquireHandler(ctx, { platform: 'telegram', source: 'purchase', quantity: 1 });
    expect(compiledSpec.verified).toBe(true);
  });

  it('keystore driver: autonomous search-buy + vaulted delivery, reusing ledger/insert/expense/events', async () => {
    const ctx = fakeCtx({});
    ctx.acquireDriver = 'keystore';
    ctx.defaultShopId = 'dark.shopping';
    ctx.config = { rubPerUsd: 90, buyDefaults: { strategy: 'reliable', minRating: 4.5 } };
    ctx.credentialVault = { put: async (v) => 'vault:' + Buffer.from(String(v)).toString('base64') };
    let orderParams;
    ctx.shopVendorFor = () => ({
      listProducts: async () => [
        { id: 165452, name: 'USA HQ IG', price: 18.85, quantity: 13, rating: '5.0', invalid_items_percent: 0, purchase_counter: 51, group: { name: 'Ручная регистрация Instagram' } }
      ],
      getBalance: async () => ({ balance: '900', currency: 'RUB' }),
      createOrder: async (a) => { orderParams = a; return { status: 'ok', id: 7770001, link: null }; },
      getOrderDownload: async () => ({ link: 'https://x/o.txt' }),
      fetchDelivered: async () => 'usr1:pass1:mail@x.com'
    });
    const res = await acquireHandler(ctx, { platform: 'instagram', source: 'purchase', quantity: 1 });
    expect(res).toMatchObject({ acquired: 1, orderId: 7770001, source: 'purchase' });
    expect(orderParams).toMatchObject({ product: 165452, quantity: 1 }); // bought the high-rated pick
    const acct = ctx.inserted[0].accts[0];
    expect(acct).toMatchObject({ platform: 'instagram', identifier: 'usr1', source: 'purchase' });
    expect(acct.secretRefs.credential).toMatch(/^vault:/); // vaulted, not plaintext
    expect(ctx.events).toContain('purchase.completed');
    expect(ctx.expenses).toHaveLength(1);
  });

  it('purchase path fails safe when no verified shop (never guesses)', async () => {
    const ctx = fakeCtx({ shop: null });
    await expect(acquireHandler(ctx, { platform: 'telegram', source: 'purchase', quantity: 2 })).rejects.toMatchObject({
      code: 'SHOP_SPEC_UNVERIFIED'
    });
  });

  it('generate path delegates to the AccountGenerator and inserts source:generate', async () => {
    const generator = { generate: async ({ count }) => Array.from({ length: count }, (_v, i) => ({ identifier: `@g${i}`, platform: 'gmail', source: 'generate', secretRefs: {} })) };
    const ctx = fakeCtx({ generator });
    const res = await acquireHandler(ctx, { platform: 'gmail', source: 'generate', quantity: 3, deviceId: 'd1' });
    expect(res).toMatchObject({ acquired: 3, source: 'generate' });
    expect(ctx.inserted[0].accts[0].source).toBe('generate');
  });

  it('generate path fails safe with GENERATION_UNAVAILABLE when no generator', async () => {
    const ctx = fakeCtx({});
    await expect(acquireHandler(ctx, { platform: 'gmail', source: 'generate', quantity: 1 })).rejects.toMatchObject({
      code: 'GENERATION_UNAVAILABLE'
    });
  });

  // Money-safety (REQUIREM §2.1 idempotency / §3.4 exactly-once): a redelivered
  // acquire (e.g. a post-purchase error triggered a retry) must NOT buy again.
  function ledgerCtx() {
    const store = new Map();
    let purchases = 0;
    const ctx = fakeCtx({ shop: { shopId: 's1', verified: true, spec: {}, unitPriceUsdCents: 100 } });
    ctx.compileShopAdapter = () => ({
      purchase: async (q) => { purchases += 1; return { orderId: `ORD-${purchases}`, amountUsdCents: q * 100 }; },
      fetchDelivered: async () => [{ identifier: '@d1', platform: 'telegram', source: 'purchase', secretRefs: {} }]
    });
    ctx.purchaseLedger = {
      begin: async (key) => { const p = store.get(key); if (p) return p; store.set(key, { status: 'purchasing' }); return null; },
      recordOrder: async (key, v) => store.set(key, v)
    };
    return { ctx, purchases: () => purchases };
  }

  it('is idempotent on the money path: a retry with the same key RESUMES, never double-buys', async () => {
    const { ctx, purchases } = ledgerCtx();
    const run = () => acquireHandler(ctx, { platform: 'telegram', source: 'purchase', quantity: 2 }, { idempotencyKey: 'acquire:telegram:5' });
    const first = await run();
    expect(first).toMatchObject({ acquired: 1, orderId: 'ORD-1' });
    expect(purchases()).toBe(1);
    // redelivery of the SAME job → must resume off the recorded order, not re-buy
    const retry = await run();
    expect(retry.orderId).toBe('ORD-1');
    expect(purchases()).toBe(1); // STILL one purchase — no double spend
  });

  it('a concurrent in-flight acquire (claim without an order yet) is a coded retryable seam, not a second buy', async () => {
    const { ctx } = ledgerCtx();
    // simulate another worker already claimed but not yet recorded the order
    await ctx.purchaseLedger.begin('acquire:telegram:9');
    await expect(acquireHandler(ctx, { platform: 'telegram', source: 'purchase', quantity: 2 }, { idempotencyKey: 'acquire:telegram:9' }))
      .rejects.toMatchObject({ code: 'ACQUIRE_IN_PROGRESS' });
  });
});
