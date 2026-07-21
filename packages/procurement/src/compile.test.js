import { compileShopAdapter } from './compile.js';
import { DomainError } from '@acq/engine-domain';

function verifiedSpec(overrides = {}) {
  return {
    shopId: 'shop1',
    baseUrl: 'https://shop1.example',
    title: 'Shop One',
    auth: { kind: 'bearer', config: {} },
    endpoints: {
      balance: { method: 'GET', path: '/balance', responseMap: { balanceUsdCents: 'data.balance' } },
      offers: { method: 'GET', path: '/offers', responseMap: { unitPriceUsdCents: 'data.unit' } },
      purchase: { method: 'POST', path: '/buy', responseMap: { orderId: 'data.order' } },
      delivery: {
        method: 'GET',
        path: '/delivery',
        responseMap: { blob: 'data.accounts' },
        deliveryFormat: {
          verified: true,
          format: 'json-array',
          itemMap: { identifier: 'phone', 'secrets.session': 'sess' }
        }
      }
    },
    verified: true,
    ...overrides
  };
}

// Fake httpClient returning canned JSON per path.
function fakeHttp(byPath) {
  const calls = [];
  return {
    calls,
    async request({ method, url }) {
      calls.push({ method, url });
      const path = new URL(url).pathname;
      return byPath[path];
    }
  };
}

const secretResolver = {
  async put(name, value) {
    return `vault:${name}:${value}`;
  }
};

describe('compileShopAdapter — verify gate', () => {
  test('throws SHOP_SPEC_UNVERIFIED for an unverified spec', () => {
    try {
      compileShopAdapter(verifiedSpec({ verified: false }), { httpClient: fakeHttp({}), secretResolver });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe('SHOP_SPEC_UNVERIFIED');
    }
  });
});

describe('compiled PurchaseAdapter', () => {
  test('getBalance maps the vendor response', async () => {
    const http = fakeHttp({ '/balance': { data: { balance: 9000 } } });
    const adapter = compileShopAdapter(verifiedSpec(), { httpClient: http, secretResolver });
    await expect(adapter.getBalance()).resolves.toEqual({ balanceUsdCents: 9000 });
  });

  test('purchase runs guards then calls the purchase endpoint', async () => {
    const http = fakeHttp({
      '/offers': { data: { unit: 100 } },
      '/balance': { data: { balance: 10_000 } },
      '/buy': { data: { order: 'ORD-1' } }
    });
    const adapter = compileShopAdapter(verifiedSpec(), {
      httpClient: http,
      secretResolver,
      config: { expectedUnitUsdCents: 100, priceDriftTolerance: 0.1, maxTotalUsdCents: 1_000 }
    });
    const res = await adapter.purchase(5);
    expect(res).toMatchObject({ orderId: 'ORD-1', amountUsdCents: 500 });
  });

  test('purchase rejects on price drift before buying', async () => {
    const http = fakeHttp({ '/offers': { data: { unit: 200 } }, '/balance': { data: { balance: 10_000 } } });
    const adapter = compileShopAdapter(verifiedSpec(), {
      httpClient: http,
      secretResolver,
      config: { expectedUnitUsdCents: 100, priceDriftTolerance: 0.1 }
    });
    await expect(adapter.purchase(1)).rejects.toMatchObject({ code: 'PROCUREMENT_PRICE_DRIFT' });
    expect(http.calls.some((c) => c.url.endsWith('/buy'))).toBe(false);
  });

  test('fetchDelivered extracts accounts and vaults secrets into secretRefs', async () => {
    const http = fakeHttp({
      '/delivery': { data: { accounts: [{ phone: '+15551230001', sess: 's1' }] } }
    });
    const adapter = compileShopAdapter(verifiedSpec(), { httpClient: http, secretResolver });
    const delivered = await adapter.fetchDelivered({ orderId: 'ORD-1' });
    expect(delivered).toEqual([
      {
        identifier: '+15551230001',
        platform: undefined,
        source: 'purchase',
        shopId: 'shop1',
        secretRefs: { session: 'vault:session:s1' }
      }
    ]);
  });
});
