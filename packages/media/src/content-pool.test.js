import { contentKey, dedupeContent, pickFreshContent } from './content-pool.js';

describe('contentKey', () => {
  test('is stable for the same caption + mediaRef', () => {
    const a = contentKey({ caption: 'hi', mediaRef: 'm1' });
    const b = contentKey({ caption: 'hi', mediaRef: 'm1' });
    expect(a).toBe(b);
  });
  test('differs when content differs', () => {
    expect(contentKey({ caption: 'a' })).not.toBe(contentKey({ caption: 'b' }));
  });
});

describe('dedupeContent', () => {
  test('removes duplicate content by key', () => {
    const items = [
      { caption: 'x', mediaRef: 'm' },
      { caption: 'x', mediaRef: 'm' },
      { caption: 'y', mediaRef: 'm' }
    ];
    expect(dedupeContent(items)).toHaveLength(2);
  });
});

describe('pickFreshContent (anti-repeat)', () => {
  const pool = [
    { caption: 'a', mediaRef: 'm1' },
    { caption: 'b', mediaRef: 'm2' },
    { caption: 'c', mediaRef: 'm3' }
  ];

  test('skips already-used content', () => {
    const usedKeys = new Set([contentKey(pool[0])]);
    const picked = pickFreshContent({ pool, usedKeys, count: 2 });
    expect(picked.map((c) => c.caption)).toEqual(['b', 'c']);
  });

  test('returns up to count fresh items', () => {
    expect(pickFreshContent({ pool, usedKeys: new Set(), count: 1 })).toHaveLength(1);
  });

  test('throws CONTENT_EXHAUSTED when nothing fresh remains', () => {
    const usedKeys = new Set(pool.map(contentKey));
    try {
      pickFreshContent({ pool, usedKeys, count: 1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('CONTENT_EXHAUSTED');
    }
  });
});
