import { EngineTarget, TARGET_STATUSES } from './engine-target.model.js';

describe('EngineTarget model', () => {
  it('validates clean with platform + targetType + identifier and sensible defaults', () => {
    const doc = new EngineTarget({ platform: 'instagram', targetType: 'profile', identifier: '@nike' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.tenantId).toBe('default');
    expect(doc.status).toBe('new');
    expect(doc.source).toBe('manual');
    expect(doc.score).toBeNull();
    expect(doc.tags).toEqual([]);
    expect(doc.version).toBe(0);
  });
  it('requires platform, targetType and identifier', () => {
    expect(new EngineTarget({}).validateSync()).toBeDefined();
    expect(new EngineTarget({ platform: 'ig' }).validateSync()).toBeDefined();
    expect(new EngineTarget({ platform: 'ig', targetType: 'profile' }).validateSync()).toBeDefined();
  });
  it('rejects an unknown status', () => {
    expect(new EngineTarget({ platform: 'ig', targetType: 'profile', identifier: '@x', status: 'nope' }).validateSync()).toBeDefined();
  });
  it('carries free-form metadata (engagement/output metrics) as Mixed', () => {
    const doc = new EngineTarget({ platform: 'tiktok', targetType: 'video', identifier: 'v123', metadata: { views: 10000, engagementRate: 0.07 } });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.metadata.views).toBe(10000);
  });
  it('exposes the target statuses', () => {
    expect(TARGET_STATUSES).toEqual(expect.arrayContaining(['new', 'enriched', 'queued', 'acted', 'excluded']));
  });
});
