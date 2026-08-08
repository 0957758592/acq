import { targetsFromEntities } from './targets-from-entities.js';

test('a scraped profile becomes a profile target carrying reach metadata', () => {
  const out = targetsFromEntities([
    { platform: 'instagram', type: 'profile', data: { handle: '@nike', displayName: 'Nike', followers: 1000, following: 5, postsCount: 20, verified: true } }
  ]);
  expect(out).toEqual([
    { platform: 'instagram', targetType: 'profile', identifier: '@nike', source: 'scrape', metadata: { displayName: 'Nike', followers: 1000, following: 5, postsCount: 20, verified: true } }
  ]);
});

test('followers/members/participants and message authors become user targets', () => {
  const out = targetsFromEntities([
    { platform: 'instagram', type: 'follower', data: { of: '@nike', handle: '@alice' } },
    { platform: 'telegram', type: 'member', data: { group: '@g', handle: '@bob' } },
    { platform: 'telegram', type: 'participant', data: { group: '@g', handle: '@carol' } },
    { platform: 'telegram', type: 'message', data: { group: '@g', id: '1', author: '@dave', text: 'hi' } }
  ]);
  expect(out.map((t) => `${t.platform}:${t.targetType}:${t.identifier}`)).toEqual([
    'instagram:user:@alice', 'telegram:user:@bob', 'telegram:user:@carol', 'telegram:user:@dave'
  ]);
  expect(out.every((t) => t.source === 'scrape')).toBe(true);
});

test('a post becomes a post target with engagement metadata', () => {
  const out = targetsFromEntities([
    { platform: 'instagram', type: 'post', data: { id: 'ABC', url: 'u', caption: 'c', likes: 10, comments: 2 } }
  ]);
  expect(out[0]).toEqual({ platform: 'instagram', targetType: 'post', identifier: 'ABC', source: 'scrape', metadata: { url: 'u', caption: 'c', likes: 10, comments: 2 } });
});

test('dedupes by (platform,targetType,identifier), merging metadata, and drops empties', () => {
  const out = targetsFromEntities([
    { platform: 'telegram', type: 'message', data: { group: '@g', id: '1', author: '@dave' } },
    { platform: 'telegram', type: 'member', data: { group: '@g', handle: '@dave' } }, // same user target
    { platform: 'telegram', type: 'member', data: { group: '@g', handle: '' } }, // empty handle -> dropped
    { platform: 'instagram', type: 'unknownish', data: { handle: '@x' } } // unsupported -> ignored
  ]);
  expect(out).toEqual([{ platform: 'telegram', targetType: 'user', identifier: '@dave', source: 'scrape' }]);
});
