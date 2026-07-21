import { createDarkShoppingProcurementAdapter } from './dark-shopping-procurement-adapter.js';

function fakeClient(overrides = {}) {
  const calls = { getBalance: [], listOffers: [], purchase: [], fetchDelivered: [] };
  return {
    calls,
    async getBalance(...args) {
      calls.getBalance.push(args);
      return overrides.balance ?? { balanceUsdCents: 5000 };
    },
    async listOffers(...args) {
      calls.listOffers.push(args);
      return overrides.offers ?? [{ unitPriceUsdCents: 100 }];
    },
    async purchase(...args) {
      calls.purchase.push(args);
      return overrides.order ?? { orderId: 'o1' };
    },
    async fetchDelivered(...args) {
      calls.fetchDelivered.push(args);
      return overrides.raw ?? { rows: ['raw-row'] };
    }
  };
}

function fakeImporter(returns = { imported: [] }) {
  const calls = [];
  return {
    calls,
    async importDelivered(raw, opts) {
      calls.push({ raw, opts });
      return returns;
    }
  };
}

const baseConfig = {
  expectedUnitUsdCents: 100,
  maxTotalUsdCents: 1000,
  priceDriftTolerance: 0.1,
  deliveryFormatVerified: false
};

describe('darkShoppingProcurementAdapter', () => {
  it('getBalance maps client balance to { balanceUsdCents }', async () => {
    const client = fakeClient({ balance: { balanceUsdCents: 5000 } });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    const result = await adapter.getBalance();

    expect(result).toEqual({ balanceUsdCents: 5000 });
    expect(client.calls.getBalance).toHaveLength(1);
  });

  it('listOffers delegates to the client', async () => {
    const offers = [{ unitPriceUsdCents: 100 }];
    const client = fakeClient({ offers });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    const result = await adapter.listOffers();

    expect(result).toEqual(offers);
    expect(client.calls.listOffers).toHaveLength(1);
  });

  it('happy path: guards pass, calls client.purchase, returns { orderId }', async () => {
    const client = fakeClient({
      offers: [{ unitPriceUsdCents: 100 }],
      balance: { balanceUsdCents: 5000 },
      order: { orderId: 'o1' }
    });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    const result = await adapter.purchase(5);

    expect(result).toEqual({ orderId: 'o1', amountUsdCents: 500 });
    expect(client.calls.purchase).toEqual([[5]]);
  });

  it('purchase returns the vendor orderId with the guard-validated amountUsdCents', async () => {
    const client = fakeClient({
      offers: [{ unitPriceUsdCents: 100 }],
      balance: { balanceUsdCents: 5000 },
      order: { orderId: 'o1' }
    });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    const result = await adapter.purchase(5);

    expect(result.orderId).toBe('o1');
    expect(result.amountUsdCents).toBe(500);
  });

  it('price drift guard: 20% drift throws and does not purchase', async () => {
    const client = fakeClient({ offers: [{ unitPriceUsdCents: 120 }] });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    await expect(adapter.purchase(5)).rejects.toThrow('PROCUREMENT_PRICE_DRIFT');
    expect(client.calls.purchase).toHaveLength(0);
  });

  it('max total guard: liveTotal 2000 > 1000 throws and does not purchase', async () => {
    const client = fakeClient({ offers: [{ unitPriceUsdCents: 100 }] });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    await expect(adapter.purchase(20)).rejects.toThrow('PROCUREMENT_MAX_TOTAL_EXCEEDED');
    expect(client.calls.purchase).toHaveLength(0);
  });

  it('insufficient balance guard: liveTotal 500 > balance 300 throws and does not purchase', async () => {
    const client = fakeClient({
      offers: [{ unitPriceUsdCents: 100 }],
      balance: { balanceUsdCents: 300 }
    });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    await expect(adapter.purchase(5)).rejects.toThrow('PROCUREMENT_INSUFFICIENT_BALANCE');
    expect(client.calls.purchase).toHaveLength(0);
  });

  it('quantity guard: non-positive/non-integer quantity throws before any client call', async () => {
    const client = fakeClient({ offers: [{ unitPriceUsdCents: 100 }] });
    const importer = fakeImporter();
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    await expect(adapter.purchase(0)).rejects.toThrow('PROCUREMENT_QUANTITY_INVALID');
    await expect(adapter.purchase(-5)).rejects.toThrow('PROCUREMENT_QUANTITY_INVALID');
    await expect(adapter.purchase(1.5)).rejects.toThrow('PROCUREMENT_QUANTITY_INVALID');
    expect(client.calls.purchase).toHaveLength(0);
    expect(client.calls.listOffers).toHaveLength(0);
  });

  it('drift guard fails safe: expectedUnitUsdCents 0 with empty offers throws, no purchase', async () => {
    const client = fakeClient({ offers: [] });
    const importer = fakeImporter();
    const config = { ...baseConfig, expectedUnitUsdCents: 0 };
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config });

    await expect(adapter.purchase(5)).rejects.toThrow('PROCUREMENT_PRICE_DRIFT');
    expect(client.calls.purchase).toHaveLength(0);
  });

  it('purchase works when destructured off the adapter (no this dependency)', async () => {
    const client = fakeClient({
      offers: [{ unitPriceUsdCents: 100 }],
      balance: { balanceUsdCents: 5000 },
      order: { orderId: 'o1' }
    });
    const importer = fakeImporter();
    const { purchase } = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    const result = await purchase(5);

    expect(result).toEqual({ orderId: 'o1', amountUsdCents: 500 });
    expect(client.calls.purchase).toEqual([[5]]);
    expect(client.calls.getBalance).toHaveLength(1);
  });

  it('fetchDelivered passes the client raw and the verifiedFormat flag to the importer', async () => {
    const raw = { rows: ['raw-row'] };
    const client = fakeClient({ raw });
    const importer = fakeImporter({ imported: ['acct'] });
    const adapter = createDarkShoppingProcurementAdapter({ client, importer, config: baseConfig });

    const result = await adapter.fetchDelivered({ orderId: 'o1' });

    expect(client.calls.fetchDelivered).toEqual([[{ orderId: 'o1' }]]);
    expect(importer.calls).toHaveLength(1);
    expect(importer.calls[0].raw).toEqual(raw);
    expect(importer.calls[0].opts).toEqual({ verifiedFormat: false });
    expect(result).toEqual({ imported: ['acct'] });
  });
});
