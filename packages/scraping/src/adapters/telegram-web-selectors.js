// Telegram web (web.telegram.org) browser-tier selector registry (TZ §10.1 T-B).
// Makes the DEFAULT web scraper extract group content on the browser tier. The
// CSS selectors are the VERIFY-BY-FACT input — confirm/tune them against the
// live web client build you target; the navigate/scroll/extract MECHANISM is
// real and generic. Every selector is overridable via `config` (no hardcode).
//
// One in-page extractor serves every targetType by branching on
// params.targetType (the adapter passes it in): messages → {id,text,author,ts},
// participants/members → {handle,role}.
const DEFAULTS = {
  baseUrl: 'https://web.telegram.org/k/#',
  message: {
    node: '[data-mid], .message, .bubble',
    idAttr: 'data-mid',
    text: '.text-content, .message-text, .translatable-message',
    author: '.peer-title, .sender-title, .name',
    time: '.time, time',
    timeAttr: 'data-timestamp'
  },
  participant: {
    node: '.ListItem, .chatlist-chat, .member',
    handle: '.peer-title, .username, .title',
    role: '.member-role, .role'
  },
  waitFor: null
};

// Build a closure-free in-page function (survives page.evaluate serialization)
// with the resolved selectors embedded in its source.
function buildExtractor(cfg) {
  const S = JSON.stringify({ message: cfg.message, participant: cfg.participant });
  // eslint-disable-next-line no-new-func
  return new Function(
    'params',
    `
    var S = ${S};
    var txt = function (el, q) { var n = q ? el.querySelector(q) : el; return n ? (n.textContent || '').trim() : ''; };
    var tt = params && params.targetType;
    if (tt === 'participants' || tt === 'members') {
      var P = S.participant;
      return Array.prototype.slice.call(document.querySelectorAll(P.node)).map(function (el) {
        return { handle: txt(el, P.handle) || txt(el), role: txt(el, P.role) || 'member' };
      }).filter(function (p) { return p.handle; });
    }
    var M = S.message;
    return Array.prototype.slice.call(document.querySelectorAll(M.node)).map(function (el) {
      var tm = el.querySelector(M.time);
      return {
        id: el.getAttribute(M.idAttr) || el.id || '',
        text: txt(el, M.text) || txt(el),
        author: txt(el, M.author),
        ts: tm ? (tm.getAttribute(M.timeAttr) || tm.getAttribute('datetime') || (tm.textContent || '').trim()) : null
      };
    }).filter(function (m) { return m.id || m.text; });
  `
  );
}

export function createTelegramWebSelectors(config = {}) {
  const cfg = {
    ...DEFAULTS,
    ...config,
    message: { ...DEFAULTS.message, ...(config.message || {}) },
    participant: { ...DEFAULTS.participant, ...(config.participant || {}) }
  };
  const extractItems = buildExtractor(cfg);
  return {
    resolveUrl(req) {
      return `${cfg.baseUrl}${String(req.target || '').replace(/^@/, '')}`;
    },
    extractItems,
    waitForSelector: cfg.waitFor
  };
}

// Multi-platform browser selector registry: forPlatform(platform) -> selectors.
// Wire the platforms you have verified selectors for; the rest stay an honest
// SCRAPE_SELECTORS_UNVERIFIED seam.
export function createBrowserSelectorRegistry(map = {}) {
  return { forPlatform: (platform) => map[platform] ?? null };
}
