import { EngineScrapeResult } from './engine-scrape-result.model.js';

describe('EngineScrapeResult model', () => {
  it('validates clean with platform/type/key and applies defaults', () => {
    const doc = new EngineScrapeResult({
      platform: 'ig',
      type: 'follower',
      target: '@star',
      key: 'ig:follower:@star:@fan',
      data: { handle: '@fan' }
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.tenantId).toBe('default');
  });

  it('requires platform, type and key', () => {
    expect(new EngineScrapeResult({}).validateSync()).toBeDefined();
  });

  it('enforces a unique index on {tenantId, key} (idempotent upsert)', () => {
    const unique = EngineScrapeResult.schema
      .indexes()
      .some(([fields, options]) => fields.tenantId === 1 && fields.key === 1 && options?.unique);
    expect(unique).toBe(true);
  });
});
