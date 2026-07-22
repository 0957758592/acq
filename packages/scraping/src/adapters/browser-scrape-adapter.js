import { domainError } from '@acq/engine-domain';

// Browser scrape tier adapter (TZ §10.1 T-B, the PRIMARY tier) — a REAL headless
// browser harness. Opens an isolated page through the injected BrowserProvider
// (Playwright in production), navigates to the resolved URL with per-request
// proxy/user-agent/cookies (anti-detect), detects a captcha wall, then drives
// infinite-scroll extraction until the page runs dry, de-duplicating rows.
//
// The per-platform URL + in-page extractor are verify-by-fact and supplied
// EITHER directly (resolveUrl/extractItems) OR per-request via a selectorRegistry
// (forPlatform(platform) -> { resolveUrl, extractItems, waitForSelector }), so a
// SINGLE generic adapter serves every platform. An unknown platform is an honest
// coded seam. The navigate/scroll/extract mechanism here is real and generic.
const DEFAULT_CAPTCHA_MARKERS = ['captcha', 'not a robot', 'unusual traffic', 'verify you are human'];

export function createBrowserScrapeAdapter({
  browserProvider,
  resolveUrl,
  extractItems,
  selectorRegistry = null,
  keyOf = (it) => JSON.stringify(it),
  maxScrolls = 10,
  waitForSelector = null,
  captchaMarkers = DEFAULT_CAPTCHA_MARKERS
} = {}) {
  if (!browserProvider || typeof browserProvider.openPage !== 'function') {
    throw new Error('browser scrape adapter requires a browserProvider with openPage()');
  }
  if (!selectorRegistry && (typeof resolveUrl !== 'function' || typeof extractItems !== 'function')) {
    throw new Error('browser scrape adapter requires resolveUrl+extractItems or a selectorRegistry');
  }

  // Resolve the platform's URL builder + in-page extractor for this request,
  // preferring the registry (multi-platform) then the fixed functions.
  function selectorsFor(req) {
    if (selectorRegistry) {
      const s = selectorRegistry.forPlatform(req.platform);
      if (!s?.resolveUrl || !s?.extractItems) {
        throw domainError('SCRAPE_SELECTORS_UNVERIFIED', `no verified browser selectors for ${req.platform}`);
      }
      return { resolveUrl: s.resolveUrl, extractItems: s.extractItems, waitForSelector: s.waitForSelector ?? waitForSelector };
    }
    return { resolveUrl, extractItems, waitForSelector };
  }

  return {
    async scrape(req) {
      const { params = {} } = req;
      // Resolve selectors first — an unverified platform fails fast without ever
      // launching a browser (no wasted engine slot).
      const sel = selectorsFor(req);
      const page = await browserProvider.openPage({ proxy: params.proxy, userAgent: params.userAgent, cookies: params.cookies });
      try {
        await page.goto(sel.resolveUrl(req));
        if (sel.waitForSelector) await page.waitForSelector(sel.waitForSelector);

        const content = (await page.content()) || '';
        const lower = content.toLowerCase();
        if (captchaMarkers.some((m) => lower.includes(m))) {
          return { captcha: true };
        }

        const seen = new Set();
        const rawItems = [];
        for (let i = 0; i < maxScrolls; i += 1) {
          const batch = (await page.evaluate(sel.extractItems, params)) ?? [];
          let fresh = 0;
          for (const item of batch) {
            const key = keyOf(item);
            if (seen.has(key)) continue;
            seen.add(key);
            rawItems.push(item);
            fresh += 1;
          }
          if (fresh === 0) break; // dry: no new rows after this scroll
          await page.scrollToBottom();
        }
        return { rawItems };
      } finally {
        await page.close();
      }
    }
  };
}
