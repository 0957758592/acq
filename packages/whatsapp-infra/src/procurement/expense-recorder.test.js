import { createExpenseRecorder } from './expense-recorder.js';

function fakeExpenseModel(returns = {}) {
  const calls = [];
  return {
    calls,
    findOneAndUpdate: (filter, update, options) => {
      calls.push({ filter, update, options });
      return returns.findOneAndUpdate ?? { _id: 'x1' };
    }
  };
}

describe('expenseRecorder', () => {
  it('records a dark_shopping expense via upsert when amountUsdCents > 0', async () => {
    const model = fakeExpenseModel({ findOneAndUpdate: { _id: 'e1' } });
    const recorder = createExpenseRecorder({ model });

    const result = await recorder.recordPurchaseExpense({
      externalReference: 'o1',
      amountUsdCents: 500,
      quantity: 5
    });

    expect(model.calls).toHaveLength(1);
    const { filter, update, options } = model.calls[0];
    expect(filter).toEqual({ provider: 'dark_shopping', externalReference: 'o1' });
    expect(update.$set.category).toBe('account');
    expect(update.$set.provider).toBe('dark_shopping');
    expect(update.$set.amountCents).toBe(500);
    expect(update.$set.currency).toBe('USD');
    expect(update.$set.description).toBe('dark.shopping purchase x5');
    expect(update.$set.externalReference).toBe('o1');
    expect(update.$set.metadata).toEqual({ quantity: 5 });
    expect(options).toEqual({ upsert: true, new: true });
    expect(result).toEqual({ _id: 'e1' });
  });

  it('skips the DB write and returns null when amountUsdCents is 0', async () => {
    const model = fakeExpenseModel();
    const recorder = createExpenseRecorder({ model });

    const result = await recorder.recordPurchaseExpense({
      externalReference: 'o2',
      amountUsdCents: 0,
      quantity: 3
    });

    expect(model.calls).toHaveLength(0);
    expect(result).toBeNull();
  });
});
