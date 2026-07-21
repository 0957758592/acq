import { normalizeEntities, naturalKey } from './read-models.js';

describe('naturalKey', () => {
  test('profile key is platform:profile:handle', () => {
    expect(naturalKey({ platform: 'tiktok', type: 'profile', data: { handle: '@bob' } })).toBe(
      'tiktok:profile:@bob'
    );
  });
  test('follower key includes the owner and the follower', () => {
    expect(naturalKey({ platform: 'ig', type: 'follower', data: { of: '@star', handle: '@fan' } })).toBe(
      'ig:follower:@star:@fan'
    );
  });
});

describe('normalizeEntities — profile', () => {
  test('maps a raw profile to the canonical read-model with a natural key', () => {
    const out = normalizeEntities({
      platform: 'tiktok',
      targetType: 'profile',
      target: '@bob',
      rawItems: [{ handle: 'bob', display_name: 'Bob', followers: 1000, verified: true }]
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      platform: 'tiktok',
      type: 'profile',
      key: 'tiktok:profile:@bob',
      data: { handle: '@bob', displayName: 'Bob', followers: 1000, verified: true }
    });
  });
});

describe('normalizeEntities — followers', () => {
  test('maps a follower list, keying each by owner+follower', () => {
    const out = normalizeEntities({
      platform: 'ig',
      targetType: 'followers',
      target: '@star',
      rawItems: [{ handle: 'fan1' }, { handle: 'fan2' }]
    });
    expect(out.map((e) => e.key)).toEqual(['ig:follower:@star:@fan1', 'ig:follower:@star:@fan2']);
  });
});

describe('normalizeEntities — posts', () => {
  test('maps posts by id with engagement counts', () => {
    const out = normalizeEntities({
      platform: 'ig',
      targetType: 'posts',
      target: '@star',
      rawItems: [{ id: 'p1', likes: 10, comments: 2, caption: 'hi' }]
    });
    expect(out[0]).toMatchObject({ type: 'post', key: 'ig:post:p1', data: { id: 'p1', likes: 10, comments: 2 } });
  });
});

describe('normalizeEntities — members', () => {
  test('maps group members keyed by group+handle', () => {
    const out = normalizeEntities({
      platform: 'telegram',
      targetType: 'members',
      target: 'chan1',
      rawItems: [{ handle: 'u1', role: 'admin' }]
    });
    expect(out[0]).toMatchObject({ type: 'member', key: 'telegram:member:chan1:@u1', data: { role: 'admin' } });
  });
});

describe('normalizeEntities — unknown target type', () => {
  test('throws SCRAPE_TARGET_UNSUPPORTED', () => {
    try {
      normalizeEntities({ platform: 'ig', targetType: 'aliens', target: 'x', rawItems: [] });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('SCRAPE_TARGET_UNSUPPORTED');
    }
  });
});
