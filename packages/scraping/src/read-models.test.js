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

describe('naturalKey — group content', () => {
  test('message key is platform:message:group:id (idempotent per message)', () => {
    expect(naturalKey({ platform: 'telegram', type: 'message', data: { group: 'g1', id: '42' } })).toBe(
      'telegram:message:g1:42'
    );
  });
  test('participant key is platform:participant:group:handle', () => {
    expect(naturalKey({ platform: 'telegram', type: 'participant', data: { group: 'g1', handle: '@u1' } })).toBe(
      'telegram:participant:g1:@u1'
    );
  });
});

describe('normalizeEntities — messages (group content + who wrote each)', () => {
  test('maps group messages keyed by group+id, capturing text + author handle + ts', () => {
    const out = normalizeEntities({
      platform: 'telegram',
      targetType: 'messages',
      target: 'g1',
      rawItems: [
        { id: '42', text: 'how do I reset it?', author: { username: 'ann' }, ts: '2026-07-24T10:00:00Z' },
        { message_id: 43, message: 'me too', from: 'bob', date: 1700000000 }
      ]
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      type: 'message',
      key: 'telegram:message:g1:42',
      data: { group: 'g1', id: '42', text: 'how do I reset it?', author: '@ann' }
    });
    // author is normalized whether raw carries an object (`author.username`) or a bare string (`from`)
    expect(out[1]).toMatchObject({ type: 'message', key: 'telegram:message:g1:43', data: { id: '43', text: 'me too', author: '@bob' } });
  });
});

describe('normalizeEntities — participants (distinct users in a group)', () => {
  test('maps participants keyed by group+handle', () => {
    const out = normalizeEntities({
      platform: 'telegram',
      targetType: 'participants',
      target: 'g1',
      rawItems: [{ username: 'ann' }, { handle: '@bob' }]
    });
    expect(out.map((e) => e.key)).toEqual(['telegram:participant:g1:@ann', 'telegram:participant:g1:@bob']);
    expect(out[0]).toMatchObject({ type: 'participant', data: { group: 'g1', handle: '@ann' } });
  });
});

describe('normalizeEntities — target stamping', () => {
  test('every normalized entity carries the top-level target it was scraped for (persisted by the repo)', () => {
    const out = normalizeEntities({ platform: 'telegram', targetType: 'messages', target: 'g1', rawItems: [{ id: '1', text: 'hi', from: 'ann' }] });
    expect(out[0].target).toBe('g1');
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
