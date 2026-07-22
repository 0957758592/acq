import { domainError } from '@acq/engine-domain';

// Playwright BrowserProvider (TZ §10.1 / §5.6) — the REAL "best technology"
// browser engine behind the primary scrape tier and the browser.session.* ops.
// A single lazily-launched Chromium is shared; each openPage() gets an ISOLATED
// context (own proxy / user-agent / cookies for anti-detect) and the pool is
// bounded by maxConcurrency (a promise-queue semaphore — no timers). The engine
// is injectable (chromium/loadChromium) so the logic is fully tested without
// browser binaries; a missing engine is an honest coded error, never a fake.
const defaultLoadChromium = async () => {
  const mod = await import('playwright').catch(() => null);
  return mod?.chromium ?? null;
};

export function createPlaywrightBrowserProvider({
  chromium = null,
  loadChromium = defaultLoadChromium,
  maxConcurrency = 4,
  headless = true,
  launchOptions = {}
} = {}) {
  let engine = chromium;
  let browserPromise = null;
  let active = 0;
  const waiters = [];

  async function ensureBrowser() {
    if (!engine) {
      engine = await loadChromium();
      if (!engine) throw domainError('BROWSER_ENGINE_UNAVAILABLE', 'playwright chromium engine is not available');
    }
    if (!browserPromise) browserPromise = engine.launch({ headless, ...launchOptions });
    return browserPromise;
  }

  function acquireSlot() {
    if (active < maxConcurrency) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiters.push(resolve));
  }
  function releaseSlot() {
    const next = waiters.shift();
    if (next) next(); // transfer the slot to a waiter (active count unchanged)
    else active -= 1;
  }

  function wrapPage({ page, context }) {
    let released = false;
    const free = () => { if (!released) { released = true; releaseSlot(); } };
    return {
      goto: (url) => page.goto(url, { waitUntil: 'domcontentloaded' }),
      waitForSelector: (selector) => page.waitForSelector(selector),
      content: () => page.content(),
      evaluate: (fn, arg) => page.evaluate(fn, arg),
      scrollToBottom: () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)),
      close: async () => {
        try {
          await context.close();
        } finally {
          free();
        }
      }
    };
  }

  return {
    async openPage({ proxy, userAgent, cookies } = {}) {
      await acquireSlot();
      try {
        const browser = await ensureBrowser();
        const context = await browser.newContext({
          ...(userAgent ? { userAgent } : {}),
          ...(proxy ? { proxy: { server: proxy } } : {})
        });
        if (cookies?.length) await context.addCookies(cookies);
        const page = await context.newPage();
        return wrapPage({ page, context });
      } catch (err) {
        releaseSlot();
        throw err;
      }
    },

    async close() {
      if (browserPromise) {
        const browser = await browserPromise;
        await browser.close();
        browserPromise = null;
      }
    }
  };
}
