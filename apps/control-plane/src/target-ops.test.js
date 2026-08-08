import { createFacade } from '@acq/control';
import { buildUseCases } from './use-cases.js';
import { buildValidators } from './validators.js';

// In-memory TargetRepo mirroring createMongoTargetRepo's contract, so the target
// surface ops are proven THROUGH the single facade (RBAC + envelope).
function memTargetRepo() {
  const store = new Map();
  const keyOf = (t) => `${t.platform}:${t.targetType}:${t.identifier}`;
  const find = (sel) => (sel.id ? [...store.values()].find((t) => t._id === sel.id) : store.get(keyOf(sel)));
  return {
    store,
    upsertMany: async (arr = []) => {
      let upserted = 0;
      for (const t of arr) {
        const k = keyOf(t);
        if (!store.has(k)) { store.set(k, { _id: k, status: t.status ?? 'new', version: 0, tags: [], score: null, metadata: {}, ...t }); upserted += 1; }
        else Object.assign(store.get(k), { source: t.source ?? store.get(k).source, ...(t.metadata ? { metadata: t.metadata } : {}) });
      }
      return { upserted };
    },
    page: async (f = {}, o = {}) => [...store.values()].filter((t) =>
      (!f.platform || t.platform === f.platform) && (!f.targetType || t.targetType === f.targetType) &&
      (!f.status || t.status === f.status) && (f.minScore == null || (t.score ?? -1) >= f.minScore) &&
      (!f.tag || (t.tags || []).includes(f.tag))).slice(0, o.limit || 100),
    get: async (sel = {}) => find(sel) ?? null,
    patch: async (sel = {}, p = {}) => {
      const t = find(sel); if (!t) return null;
      if (p.status !== undefined) t.status = p.status;
      if (p.score !== undefined) t.score = p.score;
      if (p.metadataMerge) Object.assign(t.metadata, p.metadataMerge);
      if (p.addTags?.length) t.tags = [...new Set([...(t.tags || []), ...p.addTags])];
      if (p.removeTags?.length) t.tags = (t.tags || []).filter((x) => !p.removeTags.includes(x));
      t.version += 1; return t;
    }
  };
}

function build() {
  const targetRepo = memTargetRepo();
  const facade = createFacade({ useCases: buildUseCases({ targetRepo }), validators: buildValidators(), audit: { record: async () => {} } });
  return { facade, targetRepo };
}

describe('targets surface ops (callable targets database) through the facade', () => {
  it('target.add upserts a target; readonly is forbidden (RBAC)', async () => {
    const { facade, targetRepo } = build();
    const forbidden = await facade.execute('target.add', { role: 'readonly', args: { platform: 'instagram', targetType: 'profile', identifier: '@nike' } });
    expect(forbidden.error.code).toBe('FORBIDDEN');
    const ok = await facade.execute('target.add', { role: 'operator', args: { platform: 'instagram', targetType: 'profile', identifier: '@nike', source: 'manual', metadata: { followers: 100 } } });
    expect(ok.error).toBeNull();
    expect(ok.data).toMatchObject({ upserted: 1, platform: 'instagram', identifier: '@nike' });
    expect(targetRepo.store.size).toBe(1);
  });

  it('target.add requires platform, targetType and identifier', async () => {
    const { facade } = build();
    const res = await facade.execute('target.add', { role: 'operator', args: { platform: 'instagram' } });
    expect(res.error.code).toBe('INVALID_ARGS');
  });

  it('target.import bulk-upserts, inheriting a default platform/source', async () => {
    const { facade, targetRepo } = build();
    const res = await facade.execute('target.import', { role: 'operator', args: { platform: 'tiktok', source: 'scrape', items: [{ targetType: 'video', identifier: 'v1' }, { targetType: 'video', identifier: 'v2' }] } });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ imported: 2, upserted: 2 });
    expect(targetRepo.store.size).toBe(2);
  });

  it('target.list is readable by all and filters by platform/status/minScore/tag', async () => {
    const { facade } = build();
    await facade.execute('target.add', { role: 'operator', args: { platform: 'tiktok', targetType: 'video', identifier: 'v1' } });
    await facade.execute('target.add', { role: 'operator', args: { platform: 'instagram', targetType: 'profile', identifier: '@x' } });
    const res = await facade.execute('target.list', { role: 'readonly', args: { platform: 'tiktok' } });
    expect(res.error).toBeNull();
    expect(res.data.items).toHaveLength(1);
    expect(res.data.items[0].identifier).toBe('v1');
  });

  it('target.get resolves by natural key and errors on a miss', async () => {
    const { facade } = build();
    await facade.execute('target.add', { role: 'operator', args: { platform: 'instagram', targetType: 'profile', identifier: '@nike' } });
    const hit = await facade.execute('target.get', { role: 'readonly', args: { platform: 'instagram', targetType: 'profile', identifier: '@nike' } });
    expect(hit.data.target.identifier).toBe('@nike');
    const miss = await facade.execute('target.get', { role: 'readonly', args: { platform: 'instagram', targetType: 'profile', identifier: '@ghost' } });
    expect(miss.error.code).toBe('TARGET_NOT_FOUND');
  });

  it('target.score ranks a target via the intelligence scorer and marks it enriched', async () => {
    const { facade } = build();
    await facade.execute('target.add', { role: 'operator', args: { platform: 'tiktok', targetType: 'video', identifier: 'v1' } });
    const res = await facade.execute('target.score', { role: 'operator', args: { platform: 'tiktok', targetType: 'video', identifier: 'v1', features: { followers: 5000, engagementRate: 0.08 } } });
    expect(res.error).toBeNull();
    expect(typeof res.data.score).toBe('number');
    expect(res.data.target.status).toBe('enriched');
  });

  it('target.tag and target.status mutate the target', async () => {
    const { facade } = build();
    await facade.execute('target.add', { role: 'operator', args: { platform: 'instagram', targetType: 'profile', identifier: '@nike' } });
    const tagged = await facade.execute('target.tag', { role: 'operator', args: { platform: 'instagram', targetType: 'profile', identifier: '@nike', add: ['sport'] } });
    expect(tagged.data.target.tags).toContain('sport');
    const moved = await facade.execute('target.status', { role: 'operator', args: { platform: 'instagram', targetType: 'profile', identifier: '@nike', status: 'queued' } });
    expect(moved.data.target.status).toBe('queued');
  });
});
