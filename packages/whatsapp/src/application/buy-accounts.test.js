import { buyAccounts } from './buy-accounts.js';

function makePorts(overrides = {}) {
  const calls = {
    purchase: [],
    find: [],
    fetchDelivered: [],
    insertPurchased: [],
    recordPurchaseExpense: []
  };
  const procurement = {
    async purchase(quantity) {
      calls.purchase.push(quantity);
      return overrides.purchaseResult ?? { orderId: 'o1', amountUsdCents: 500 };
    },
    async fetchDelivered(order) {
      calls.fetchDelivered.push(order);
      return overrides.delivered ?? [];
    }
  };
  const accountRepo = {
    async find(filter) {
      calls.find.push(filter);
      return overrides.existing ?? [];
    },
    async insertPurchased(accounts, meta) {
      calls.insertPurchased.push({ accounts, meta });
    }
  };
  const expenseRecorder = {
    async recordPurchaseExpense(expense) {
      calls.recordPurchaseExpense.push(expense);
    }
  };
  return { ports: { procurement, accountRepo, expenseRecorder }, calls };
}

describe('buyAccounts', () => {
  it('purchases, inserts delivered accounts and records the expense (happy path)', async () => {
    const delivered = [
      { msisdn: '+491700000001', source: 'dark_shopping', secretRefs: {} },
      { msisdn: '+491700000002', source: 'dark_shopping', secretRefs: {} }
    ];
    const { ports, calls } = makePorts({
      purchaseResult: { orderId: 'o1', amountUsdCents: 500 },
      existing: [],
      delivered
    });

    const result = await buyAccounts({ quantity: 2 }, ports);

    expect(calls.purchase).toEqual([2]);
    expect(calls.find).toEqual([{ 'metadata.orderId': 'o1' }]);
    expect(calls.insertPurchased).toEqual([{ accounts: delivered, meta: { orderId: 'o1' } }]);
    expect(calls.recordPurchaseExpense).toEqual([
      { externalReference: 'o1', amountUsdCents: 500, quantity: 2 }
    ]);
    expect(result).toEqual({ orderId: 'o1', inserted: 2, idempotent: false });
  });

  it('is idempotent: skips insert/charge when the order is already persisted', async () => {
    const { ports, calls } = makePorts({
      purchaseResult: { orderId: 'o1', amountUsdCents: 500 },
      existing: [{}]
    });

    const result = await buyAccounts({ quantity: 2 }, ports);

    expect(calls.purchase).toEqual([2]);
    expect(calls.find).toEqual([{ 'metadata.orderId': 'o1' }]);
    expect(calls.fetchDelivered).toEqual([]);
    expect(calls.insertPurchased).toEqual([]);
    expect(calls.recordPurchaseExpense).toEqual([]);
    expect(result).toEqual({ orderId: 'o1', inserted: 0, idempotent: true });
  });
});
