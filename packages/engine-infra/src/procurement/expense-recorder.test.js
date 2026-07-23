import { createExpenseRecorder } from './expense-recorder.js';

function fakeModel() {
  const calls = [];
  return {
    calls,
    findOneAndUpdate: async (filter, update, opts) => {
      calls.push({ filter, update, opts });
      return { _id: 'x', ...update.$set };
    }
  };
}

describe('generic createExpenseRecorder', () => {
  it('upserts idempotently on (provider, externalReference) for any provider', async () => {
    const model = fakeModel();
    const rec = createExpenseRecorder({ model });
    const row = await rec.record({ provider: 'shop-abc', externalReference: 'ORD-1', amountUsdCents: 250, platform: 'telegram', quantity: 5 });
    expect(row).toMatchObject({ provider: 'shop-abc', amountCents: 250, category: 'account' });
    expect(model.calls[0].filter).toEqual({ tenantId: 'default', provider: 'shop-abc', externalReference: 'ORD-1' });
    expect(model.calls[0].opts.upsert).toBe(true);
    expect(model.calls[0].update.$set.metadata).toMatchObject({ platform: 'telegram', quantity: 5 });
  });

  it('never writes a zero/negative-amount row', async () => {
    const model = fakeModel();
    const rec = createExpenseRecorder({ model });
    expect(await rec.record({ provider: 'p', externalReference: 'r', amountUsdCents: 0 })).toBeNull();
    expect(model.calls).toHaveLength(0);
  });

  it('honors an explicit category (e.g. proxy/device), defaulting to account', async () => {
    const model = fakeModel();
    const rec = createExpenseRecorder({ model });
    await rec.record({ provider: 'p', externalReference: 'r', amountUsdCents: 10, category: 'proxy' });
    expect(model.calls[0].update.$set.category).toBe('proxy');
  });
});
