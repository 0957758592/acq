/**
 * BrowserProvider port (TZ §4/§10.6) — Browserbase-class headless-browser fleet:
 * @typedef {Object} BrowserProvider
 * @property {(opts: { stealth?: boolean, proxyId?: string, contextId?: string, geo?: string }) => Promise<{ sessionId: string, cdpUrl: string }>} createSession
 * @property {(sessionId: string) => Promise<Object>} connect
 * @property {(sessionId: string) => Promise<string>} liveView
 * @property {(sessionId: string) => Promise<Object>} record
 * @property {(sessionId: string) => Promise<void>} close
 */
export {
  createBrowserPool,
  canAcquire,
  acquireSession,
  releaseSession,
  activeCount
} from './session-pool.js';
