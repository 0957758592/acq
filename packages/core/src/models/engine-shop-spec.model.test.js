import { EngineShopSpec } from './engine-shop-spec.model.js';

describe('EngineShopSpec model', () => {
  it('validates clean with shopId + baseUrl and defaults verified=false', () => {
    const doc = new EngineShopSpec({ shopId: 'darkshop', baseUrl: 'https://dark.shopping' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.tenantId).toBe('default');
    expect(doc.verified).toBe(false);
    expect(doc.priority).toBe(100);
  });

  it('requires shopId and baseUrl', () => {
    expect(new EngineShopSpec({}).validateSync()).toBeDefined();
  });

  it('enforces a unique index on {tenantId, shopId}', () => {
    const unique = EngineShopSpec.schema
      .indexes()
      .some(([f, o]) => f.tenantId === 1 && f.shopId === 1 && o?.unique);
    expect(unique).toBe(true);
  });
});
