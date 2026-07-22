import { createShopRegistry } from './shop-registry.js';
import { DomainError } from '@acq/engine-domain';

function validSpec(overrides = {}) {
  return {
    shopId: 'darkshop',
    baseUrl: 'https://dark.shopping',
    title: 'Dark',
    auth: { kind: 'cookie-session', config: {} },
    endpoints: {
      balance: { method: 'GET', path: '/b', responseMap: {} },
      offers: { method: 'GET', path: '/o', responseMap: {} },
      purchase: { method: 'POST', path: '/p', responseMap: {} },
      delivery: { method: 'GET', path: '/d', responseMap: {}, deliveryFormat: { verified: false, format: 'lines' } }
    },
    verified: false,
    ...overrides
  };
}

function fakeModel() {
  const rows = new Map();
  const calls = [];
  const lean = (v) => ({ lean: async () => v });
  return {
    rows,
    calls,
    findOneAndUpdate: async (filter, update, options) => {
      calls.push({ filter, update, options });
      const key = filter.shopId;
      const existing = rows.get(key) || {};
      const merged = { ...existing, ...(update.$set || {}), ...(options?.upsert ? update.$setOnInsert : {}) };
      rows.set(key, merged);
      return merged;
    },
    findOne: (filter) => lean(rows.get(filter.shopId) ?? null),
    find: (filter) => ({
      sort: () => ({
        lean: async () =>
          [...rows.values()].filter(
            (r) => r.verified && r.available !== false && (!filter.platform || r.platform === filter.platform)
          )
      })
    })
  };
}

describe('createShopRegistry', () => {
  it('register validates the spec and stores it unverified', async () => {
    const model = fakeModel();
    const reg = createShopRegistry({ model });
    const stored = await reg.register(validSpec());
    expect(stored.verified).toBe(false);
    expect(stored.shopId).toBe('darkshop');
    expect(model.rows.get('darkshop').spec.auth.kind).toBe('cookie-session');
  });

  it('register rejects an invalid spec', async () => {
    const reg = createShopRegistry({ model: fakeModel() });
    await expect(reg.register(validSpec({ auth: { kind: 'telepathy', config: {} } }))).rejects.toBeInstanceOf(
      DomainError
    );
  });

  it('approve flips verified=true with approver', async () => {
    const model = fakeModel();
    const reg = createShopRegistry({ model });
    await reg.register(validSpec());
    const approved = await reg.approve('darkshop', { approvedBy: 'julian' });
    expect(approved.verified).toBe(true);
    expect(approved.approvedBy).toBe('julian');
  });

  it('listVerified returns only verified+available shops', async () => {
    const model = fakeModel();
    const reg = createShopRegistry({ model });
    await reg.register(validSpec({ shopId: 's1', platform: 'telegram' }));
    await reg.register(validSpec({ shopId: 's2', platform: 'telegram' }));
    await reg.approve('s1', { approvedBy: 'x' });
    const verified = await reg.listVerified('telegram');
    expect(verified.map((s) => s.shopId)).toEqual(['s1']);
  });
});
