import { createSelectorStore } from './selector-store.js';

function fakeModel() {
  const rows = new Map();
  return {
    findOne: (f) => ({ lean: async () => rows.get(f.platform) ?? null }),
    find: () => ({ lean: async () => [...rows.values()] }),
    findOneAndUpdate: async (f, u) => { const merged = { ...(rows.get(f.platform) || {}), platform: f.platform, ...(u.$set || {}), ...(u.$setOnInsert || {}) }; rows.set(f.platform, merged); return merged; }
  };
}

describe('createSelectorStore', () => {
  it('set upserts per-platform overrides; get returns them; forPlatform resolves them for the adapter', async () => {
    const store = createSelectorStore({ model: fakeModel() });
    expect((await store.get('telegram')).selectors).toEqual({}); // none yet
    await store.set('telegram', { actions: { report: { triggerTexts: ['Report abuse'] } } }, { updatedBy: 'julian' });
    expect((await store.get('telegram')).selectors).toEqual({ actions: { report: { triggerTexts: ['Report abuse'] } } });
    expect(await store.forPlatform('telegram')).toEqual({ actions: { report: { triggerTexts: ['Report abuse'] } } });
  });

  it('list returns all platform overrides', async () => {
    const store = createSelectorStore({ model: fakeModel() });
    await store.set('telegram', { homeTexts: ['Chats'] });
    await store.set('discord', { submitTexts: ['Log In'] });
    expect((await store.list()).map((r) => r.platform).sort()).toEqual(['discord', 'telegram']);
  });
});
