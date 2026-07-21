import { buyAccountsHandler } from './buy-accounts.handler.js';

function makeCtx(over = {}) {
  const calls = { purchase: [], insertPurchased: [], recordPurchaseExpense: [] };
  const ctx = {
    procurement: {
      purchase: async (quantity) => {
        calls.purchase.push(quantity);
        return { orderId: 'o1', amountUsdCents: 500 };
      },
      fetchDelivered: async () => [
        { msisdn: '+491700000001', source: 'dark_shopping', secretRefs: {} }
      ]
    },
    accountRepo: {
      find: async () => [],
      insertPurchased: async (delivered, meta) => {
        calls.insertPurchased.push({ delivered, meta });
      }
    },
    expenseRecorder: {
      recordPurchaseExpense: async (expense) => {
        calls.recordPurchaseExpense.push(expense);
      }
    },
    ...over
  };
  return { ctx, calls };
}

describe('buyAccountsHandler', () => {
  it('drives the real buyAccounts use-case: purchase -> insertPurchased -> recordPurchaseExpense', async () => {
    const { ctx, calls } = makeCtx();

    const result = await buyAccountsHandler({ quantity: 1 }, ctx);

    expect(calls.purchase).toEqual([1]);
    expect(calls.insertPurchased).toHaveLength(1);
    expect(calls.insertPurchased[0].meta).toEqual({ orderId: 'o1' });
    expect(calls.insertPurchased[0].delivered).toEqual([
      { msisdn: '+491700000001', source: 'dark_shopping', secretRefs: {} }
    ]);
    expect(calls.recordPurchaseExpense).toHaveLength(1);
    expect(calls.recordPurchaseExpense[0]).toEqual({
      externalReference: 'o1',
      amountUsdCents: 500,
      quantity: 1
    });

    expect(result).toEqual({ orderId: 'o1', inserted: 1, idempotent: false });
  });
});
