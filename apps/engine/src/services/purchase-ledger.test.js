import { createPurchaseLedger } from './purchase-ledger.js';

// Fake model that models Mongo's findOneAndUpdate(upsert, new:false): returns the
// PRE-existing doc (null when it inserts), which is exactly how the atomic claim
// distinguishes "we won" (null) from "already claimed" (prior doc).
function fakeModel() {
  const rows = new Map();
  return {
    rows,
    findOneAndUpdate: async (filter, update, opts) => {
      const key = filter.idempotencyKey;
      const existing = rows.get(key) || null;
      if (!existing && opts?.upsert) rows.set(key, { ...filter, ...(update.$setOnInsert || {}) });
      return existing; // new:false => pre-update doc (null if inserted)
    },
    updateOne: async (filter, update) => {
      const key = filter.idempotencyKey;
      rows.set(key, { ...(rows.get(key) || filter), ...(update.$set || {}) });
    }
  };
}

describe('createPurchaseLedger (exactly-once claim for the money path)', () => {
  it('begin() returns null for a FIRST claim (we won) and the prior doc on re-claim', async () => {
    const ledger = createPurchaseLedger({ model: fakeModel(), tenantId: 't1' });
    expect(await ledger.begin('acquire:tg:5')).toBeNull(); // first → we purchase
    const prior = await ledger.begin('acquire:tg:5'); // second → already claimed
    expect(prior).toMatchObject({ idempotencyKey: 'acquire:tg:5', status: 'purchasing' });
  });

  it('recordOrder() stamps the order so a later begin() resumes instead of re-buying', async () => {
    const ledger = createPurchaseLedger({ model: fakeModel(), tenantId: 't1' });
    await ledger.begin('acquire:tg:9');
    await ledger.recordOrder('acquire:tg:9', { orderId: 'ORD-1', amountUsdCents: 200 });
    const prior = await ledger.begin('acquire:tg:9');
    expect(prior).toMatchObject({ orderId: 'ORD-1', amountUsdCents: 200, status: 'purchased' });
  });

  it('scopes the claim to the tenant', async () => {
    const model = fakeModel();
    const ledger = createPurchaseLedger({ model, tenantId: 'tenant-A' });
    await ledger.begin('k1');
    expect([...model.rows.values()][0]).toMatchObject({ tenantId: 'tenant-A' });
  });
});
