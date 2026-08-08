import { createInstagramWebSelectors } from './instagram-web-selectors.js';

// Minimal fake DOM so the serialized in-page extractor (new Function referencing
// `document`) can be exercised without a real browser. querySelector(All) look up
// the provided map by the exact selector string.
function fakeEl({ text = '', attrs = {}, kids = {} } = {}) {
  return { textContent: text, getAttribute: (a) => (a in attrs ? attrs[a] : null), querySelector: (q) => kids[q] ?? null };
}
function fakeDoc(map = {}) {
  return { querySelector: (q) => map[q]?.one ?? null, querySelectorAll: (q) => map[q]?.all ?? [] };
}

const sel = createInstagramWebSelectors({
  profile: { username: '.u', name: '.n', bio: '.b', stat: '.s', verified: '.v' },
  list: { node: '.f' },
  post: { node: '.p', caption: 'img' }
});

afterEach(() => { delete global.document; });

describe('createInstagramWebSelectors', () => {
  it('resolveUrl builds instagram.com profile URLs (strips @)', () => {
    expect(sel.resolveUrl({ target: '@nike', targetType: 'profile' })).toBe('https://www.instagram.com/nike/');
    expect(sel.resolveUrl({ target: 'nike', targetType: 'followers' })).toBe('https://www.instagram.com/nike/');
  });

  it('extracts a profile (username/name/bio + parsed k/m stat counts + verified)', () => {
    global.document = fakeDoc({
      '.u': { one: fakeEl({ text: 'nike' }) },
      '.n': { one: fakeEl({ text: 'Nike' }) },
      '.b': { one: fakeEl({ text: 'Just do it' }) },
      '.s': { all: [fakeEl({ text: '120' }), fakeEl({ text: '1.2m' }), fakeEl({ text: '50' })] },
      '.v': { one: fakeEl({ text: '' }) }
    });
    const rows = sel.extractItems({ targetType: 'profile', target: 'nike' });
    expect(rows).toEqual([{ username: 'nike', name: 'Nike', bio: 'Just do it', postsCount: 120, followers: 1200000, following: 50, verified: true }]);
  });

  it('extracts a followers list (username from the href)', () => {
    global.document = fakeDoc({ '.f': { all: [fakeEl({ attrs: { href: '/alice/' } }), fakeEl({ attrs: { href: '/bob/' } })] } });
    expect(sel.extractItems({ targetType: 'followers' })).toEqual([{ username: 'alice' }, { username: 'bob' }]);
  });

  it('extracts posts (shortcode + url from the /p/ href, caption from img alt)', () => {
    global.document = fakeDoc({ '.p': { all: [fakeEl({ attrs: { href: '/p/ABC123/' }, kids: { img: fakeEl({ attrs: { alt: 'a shoe' } }) } })] } });
    expect(sel.extractItems({ targetType: 'posts' })).toEqual([
      { shortcode: 'ABC123', url: 'https://www.instagram.com/p/ABC123/', caption: 'a shoe' }
    ]);
  });

  it('returns empty rows on a DOM mismatch (verify-by-fact, never fabricated)', () => {
    global.document = fakeDoc({});
    expect(sel.extractItems({ targetType: 'followers' })).toEqual([]);
    expect(sel.extractItems({ targetType: 'posts' })).toEqual([]);
  });
});
