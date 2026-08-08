// Instagram web (instagram.com) browser-tier selector registry (TZ §10.1 T-B).
// One in-page extractor serves every targetType (profile | followers | following
// | posts) by branching on params.targetType. The CSS selectors are the
// VERIFY-BY-FACT input — Instagram's DOM is hashed/volatile, so confirm/tune them
// against the live build and pass overrides via `config` (no hardcode); the
// navigate/scroll/extract MECHANISM is real and generic. A selector mismatch
// yields EMPTY rows, never fabricated data. Live IG reads need an authenticated
// session + residential proxy (params.useResidential) — the anti-detect stack.
const DEFAULTS = {
  baseUrl: 'https://www.instagram.com/',
  profile: {
    username: 'header h2, header h1',
    name: 'header section h1, header h1 + span',
    bio: 'header section > div > span, header section h1 + span + div',
    stat: 'header li',
    verified: 'header svg[aria-label="Verified"]'
  },
  list: { node: 'div[role="dialog"] a[role="link"][href^="/"], a[role="link"][href^="/"]' },
  post: { node: 'article a[href*="/p/"], a[href*="/p/"]', caption: 'img' },
  waitFor: 'header'
};

// Build a closure-free in-page function (survives page.evaluate serialization)
// with the resolved selectors embedded in its source.
function buildExtractor(cfg) {
  const S = JSON.stringify({ profile: cfg.profile, list: cfg.list, post: cfg.post, baseUrl: cfg.baseUrl });
  // eslint-disable-next-line no-new-func
  return new Function(
    'params',
    `
    var S = ${S};
    var slice = function (n) { return Array.prototype.slice.call(n); };
    var txt = function (el, q) { if (!el) return ''; var n = q ? el.querySelector(q) : el; return n ? (n.textContent || '').trim() : ''; };
    var parseNum = function (s) {
      s = String(s == null ? '' : s).trim().toLowerCase().replace(/,/g, '');
      var m = parseFloat(s); if (!isFinite(m)) return 0;
      if (/m/.test(s)) m *= 1e6; else if (/k/.test(s)) m *= 1e3;
      return Math.round(m);
    };
    var tt = params && params.targetType;
    if (tt === 'followers' || tt === 'following') {
      return slice(document.querySelectorAll(S.list.node)).map(function (el) {
        var href = el.getAttribute('href') || '';
        var u = href.replace(/\\//g, '').trim();
        return { username: u || txt(el) };
      }).filter(function (x) { return x.username; });
    }
    if (tt === 'posts') {
      return slice(document.querySelectorAll(S.post.node)).map(function (el) {
        var href = el.getAttribute('href') || '';
        var m = href.match(/\\/p\\/([^/]+)/);
        var img = el.querySelector(S.post.caption);
        return { shortcode: m ? m[1] : '', url: href ? (S.baseUrl.replace(/\\/$/, '') + href) : '', caption: img ? (img.getAttribute('alt') || '') : '' };
      }).filter(function (x) { return x.shortcode; });
    }
    var stats = slice(document.querySelectorAll(S.profile.stat)).map(function (el) { return parseNum(txt(el)); });
    return [{
      username: txt(document.querySelector(S.profile.username)) || (params && params.target) || '',
      name: txt(document.querySelector(S.profile.name)),
      bio: txt(document.querySelector(S.profile.bio)),
      postsCount: stats[0] || 0,
      followers: stats[1] || 0,
      following: stats[2] || 0,
      verified: !!document.querySelector(S.profile.verified)
    }];
  `
  );
}

export function createInstagramWebSelectors(config = {}) {
  const cfg = {
    ...DEFAULTS,
    ...config,
    profile: { ...DEFAULTS.profile, ...(config.profile || {}) },
    list: { ...DEFAULTS.list, ...(config.list || {}) },
    post: { ...DEFAULTS.post, ...(config.post || {}) }
  };
  const extractItems = buildExtractor(cfg);
  return {
    resolveUrl(req) {
      return `${cfg.baseUrl}${String(req.target || '').replace(/^@/, '')}/`;
    },
    extractItems,
    waitForSelector: cfg.waitFor
  };
}
