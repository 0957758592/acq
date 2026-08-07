import { shopBuy } from './shop-buy.js';

const offers = [
  { id: 1, name: 'LinkedIn.com | ManReg | 2FA | USA IP', price: 1703.75, quantity: 1, minimum_order: 1, purchase_counter: 5 },
  { id: 2, name: 'LinkedIn Autoreg | USA', price: 43.5, quantity: 95, minimum_order: 1, purchase_counter: 900 }
];

function makeVendor({ balance = '991.2500', currency = 'RUB', items = offers } = {}) {
  const calls = { createOrder: [], listProducts: null };
  return {
    calls,
    getBalance: async () => ({ balance, currency }),
    listProducts: async (p) => { calls.listProducts = p; return items; },
    createOrder: async (a) => { calls.createOrder.push(a); return { status: 'ok', id: 555, link: 'https://dark.shopping/storage/x.txt' }; }
  };
}

function ctxWith(vendor, { rubPerUsd = 90 } = {}) {
  return { config: { rubPerUsd }, defaultShopId: 'dark.shopping', shopVendorFor: () => vendor };
}

test('dry plan (confirm=false) selects the offer, projects balance, and DOES NOT spend', async () => {
  const vendor = makeVendor();
  const res = await shopBuy(ctxWith(vendor), { platform: 'linkedin', country: 'USA', quantity: 1, strategy: 'cheapest', confirm: false });

  expect(res.confirmed).toBe(false);
  expect(res.plan.product.id).toBe(2); // cheapest in-stock USA
  expect(res.plan.totalRub).toBe(43.5);
  expect(res.plan.balanceRub).toBe(991.25);
  expect(res.plan.balanceAfterRub).toBe(947.75);
  expect(res.plan.affordable).toBe(true);
  expect(res.plan.totalUsdCents).toBe(48); // 43.5/90*100
  expect(vendor.calls.createOrder).toHaveLength(0); // NO SPEND
  // the search was scoped to in-stock + covering the requested quantity
  expect(vendor.calls.listProducts).toMatchObject({ only_in_stock: 1, quantity_from: 1 });
});

test('confirm=true places the order by product id with the idempotence key', async () => {
  const vendor = makeVendor();
  const res = await shopBuy(ctxWith(vendor), { platform: 'linkedin', country: 'USA', quantity: 1, confirm: true, idempotenceId: 'idem-1' });

  expect(res.confirmed).toBe(true);
  expect(vendor.calls.createOrder[0]).toMatchObject({ product: 2, quantity: 1, idempotenceId: 'idem-1' });
  expect(res.order).toMatchObject({ orderId: 555, status: 'ok', link: expect.stringContaining('.txt') });
});

test('no in-stock offer -> coded NO_MATCHING_OFFER seam (never guesses)', async () => {
  await expect(shopBuy(ctxWith(makeVendor({ items: [] })), { platform: 'linkedin', country: 'USA', confirm: false }))
    .rejects.toMatchObject({ code: 'NO_MATCHING_OFFER' });
});

test('confirm with insufficient balance throws before spending', async () => {
  const vendor = makeVendor({ balance: '10.0000' });
  await expect(shopBuy(ctxWith(vendor), { platform: 'linkedin', country: 'USA', quantity: 1, confirm: true }))
    .rejects.toMatchObject({ code: 'PROCUREMENT_INSUFFICIENT_BALANCE' });
  expect(vendor.calls.createOrder).toHaveLength(0);
});

test('dry plan honestly reports affordable:false when funds are short (no throw, no spend)', async () => {
  const vendor = makeVendor({ balance: '10.0000' });
  const res = await shopBuy(ctxWith(vendor), { platform: 'linkedin', country: 'USA', quantity: 1, confirm: false });
  expect(res.confirmed).toBe(false);
  expect(res.plan.affordable).toBe(false);
  expect(vendor.calls.createOrder).toHaveLength(0);
});
