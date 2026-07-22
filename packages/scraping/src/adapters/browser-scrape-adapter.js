// Browser scrape tier adapter (TZ §10.1 T-B, the PRIMARY tier) — a REAL headless
// browser harness. Opens an isolated page through the injected BrowserProvider
// (Playwright in production), navigates to the resolved URL with per-request
// proxy/user-agent/cookies (anti-detect), detects a captcha wall, then drives
// infinite-scroll extraction until the page runs dry, de-duplicating rows. The
// per-platform URL + in-page extractor are injected (verify-by-fact selectors);
// the navigate/scroll/extract mechanism here is real and platform-agnostic.
const DEFAULT_CAPTCHA_MARKERS = ['captcha', 'not a robot', 'unusual traffic', 'verify you are human'];

export function createBrowserScrapeAdapter({
  browserProvider,
  resolveUrl,
  extractItems,
  keyOf = (it) => JSON.stringify(it),
  maxScrolls = 10,
  waitForSelector = null,
  captchaMarkers = DEFAULT_CAPTCHA_MARKERS
} = {}) {
  if (!browserProvider || typeof browserProvider.openPage !== 'function') {
    throw new Error('browser scrape adapter requires a browserProvider with openPage()');
  }
  if (typeof resolveUrl !== 'function') throw new Error('browser scrape adapter requires resolveUrl');
  if (typeof extractItems !== 'function') throw new Error('browser scrape adapter requires extractItems');

  return {
    async scrape(req) {
      const { params = {} } = req;
      const page = await browserProvider.openPage({ proxy: params.proxy, userAgent: params.userAgent, cookies: params.cookies });
      try {
        await page.goto(resolveUrl(req));
        if (waitForSelector) await page.waitForSelector(waitForSelector);

        const content = (await page.content()) || '';
        const lower = content.toLowerCase();
        if (captchaMarkers.some((m) => lower.includes(m))) {
          return { captcha: true };
        }

        const seen = new Set();
        const rawItems = [];
        for (let i = 0; i < maxScrolls; i += 1) {
          const batch = (await page.evaluate(extractItems, params)) ?? [];
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
