import { domainError } from '@acq/engine-domain';

import { createBrowserPool, acquireSession, releaseSession } from './session-pool.js';

// Real session-based BrowserProvider (TZ §10.6) — a Browserbase-class fleet on
// Playwright/Chromium. Each createSession() gets an ISOLATED context (own proxy /
// user-agent for anti-detect), capacity-gated by the pure session-pool. Exposes
// a live-view devtools URL (via the CDP /json/list endpoint), record (tracing),
// and schema-validated extract() (EXTRACTION_SCHEMA_MISMATCH on shape drift).
// The engine is injectable so the logic is fully tested without browser binaries;
// a missing engine is an honest coded error, never a fake.
const defaultLoadChromium = async () => {
  const mod = await import('playwright').catch(() => null);
  return mod?.chromium ?? null;
};

export function createBrowserProvider({
  chromium = null,
  loadChromium = defaultLoadChromium,
  maxConcurrent = 4,
  headless = true,
  debugPort = 0,
  fetchImpl = globalThis.fetch,
  launchOptions = {}
} = {}) {
  let engine = chromium;
  let browserPromise = null;
  let pool = createBrowserPool({ maxConcurrent });
  const sessions = new Map();
  let counter = 0;

  async function ensureBrowser() {
    if (!engine) {
      engine = await loadChromium();
      if (!engine) throw domainError('BROWSER_ENGINE_UNAVAILABLE', 'playwright chromium engine is not available');
    }
    if (!browserPromise) {
      const args = debugPort ? [`--remote-debugging-port=${debugPort}`] : [];
      browserPromise = engine.launch({ headless, args, ...launchOptions });
    }
    return browserPromise;
  }

  function requireSession(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) throw domainError('BROWSER_SESSION_NOT_FOUND', `no browser session ${sessionId}`);
    return s;
  }

  return {
    async createSession({ proxy, userAgent, contextId, geo } = {}) {
      const browser = await ensureBrowser();
      const sessionId = contextId || `sess-${(counter += 1)}`;
      pool = acquireSession(pool, sessionId); // throws BROWSER_POOL_EXHAUSTED at capacity
      try {
        const context = await browser.newContext({
          ...(userAgent ? { userAgent } : {}),
          ...(proxy ? { proxy: { server: proxy } } : {})
        });
        const page = await context.newPage();
        sessions.set(sessionId, { context, page, geo });
        const cdpUrl = debugPort ? `http://127.0.0.1:${debugPort}` : '';
        return { sessionId, cdpUrl };
      } catch (err) {
        pool = releaseSession(pool, sessionId);
        throw err;
      }
    },

    async connect(sessionId) {
      const { context, page } = requireSession(sessionId);
      return { context, page };
    },

    async extract(sessionId, { url, pageFunction, schema, arg } = {}) {
      const { page } = requireSession(sessionId);
      if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
      const raw = await page.evaluate(pageFunction, arg);
      if (schema && typeof schema.validate === 'function') {
        try {
          return await schema.validate(raw, { strict: false });
        } catch (err) {
          throw Object.assign(domainError('EXTRACTION_SCHEMA_MISMATCH', err.message), { details: err.errors ?? [err.message] });
        }
      }
      return raw;
    },

    async record(sessionId, { start = true } = {}) {
      const { context } = requireSession(sessionId);
      if (typeof context.tracing?.start !== 'function') return { recording: false, unsupported: true };
      if (start) await context.tracing.start({ screenshots: true, snapshots: true });
      else await context.tracing.stop();
      return { recording: start };
    },

    async liveView(sessionId) {
      const { context, page } = requireSession(sessionId);
      if (!debugPort) throw domainError('BROWSER_LIVEVIEW_UNAVAILABLE', 'liveView requires a CDP debug port');
      const cdp = await context.newCDPSession(page); // Playwright: CDP session is minted off the context
      const info = await cdp.send('Target.getTargetInfo');
      const targetId = info?.targetInfo?.targetId;
      const res = await fetchImpl(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = res?.ok ? await res.json() : [];
      const match = targets.find((t) => t.id === targetId) || targets.find((t) => t.url === page.url());
      if (!match) throw domainError('BROWSER_LIVEVIEW_UNAVAILABLE', 'no devtools target for session');
      return { sessionId, devtoolsUrl: match.devtoolsFrontendUrl, wsUrl: match.webSocketDebuggerUrl };
    },

    async close(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) return;
      try {
        await s.context.close();
      } finally {
        sessions.delete(sessionId);
        pool = releaseSession(pool, sessionId);
      }
    },

    async shutdown() {
      if (browserPromise) {
        const browser = await browserPromise;
        await browser.close();
        browserPromise = null;
      }
    }
  };
}
