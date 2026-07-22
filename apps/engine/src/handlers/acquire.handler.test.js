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
});
