import { domainError } from '@acq/engine-domain';

// Browserbase adapter — a CLOUD BrowserProvider backend behind the SAME port as
// our self-hosted Puppeteer pool (createSession/connect/liveView/record/close/
// extract). It fronts Browserbase's managed fleet (stealth, residential proxies,
// CAPTCHA solving, thousands of concurrent CDP sessions, live-view/takeover).
//
// Verify-by-fact: every method makes the REAL vendor HTTP call. Without a key
// the factory fails safe with a coded BROWSERBASE_API_KEY_REQUIRED (never a
// silent stub); a vendor rejection maps to a coded BROWSERBASE_REQUEST_FAILED
// (never a leaked INTERNAL). Swap the backend via config — core code unchanged.
export function createBrowserbaseProvider({
  apiKey,
  projectId = null,
  baseUrl = 'https://api.browserbase.com',
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000
} = {}) {
  if (!apiKey) throw domainError('BROWSERBASE_API_KEY_REQUIRED', 'browserbase backend requires an API key');
  const root = String(baseUrl).replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json', 'x-bb-api-key': apiKey };

  async function call(path, { method = 'GET', body = null } = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller?.signal
      });
    } catch (err) {
      throw domainError('BROWSERBASE_REQUEST_FAILED', `browserbase ${method} ${path} failed: ${err.message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await response.text();
    if (!response.ok) {
      throw domainError('BROWSERBASE_REQUEST_FAILED', `browserbase responded ${response.status}: ${String(text).slice(0, 200)}`);
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw domainError('BROWSERBASE_RESPONSE_INVALID', 'browserbase returned non-JSON');
    }
  }

  return {
    kind: 'cloud',
    provider: 'browserbase',
    // Open a managed stealth session. Geo/proxy/context map onto Browserbase's
    // session config; the returned CDP url is what Puppeteer/Stagehand connects to.
    async createSession({ geo = null, proxyId = null, contextId = null, stealth = true } = {}) {
      const json = await call('/v1/sessions', {
        method: 'POST',
        body: {
          projectId,
          ...(proxyId ? { proxies: true } : {}),
          ...(contextId ? { browserSettings: { context: { id: contextId, persist: true } } } : {}),
          ...(geo ? { region: geo } : {}),
          keepAlive: false,
          stealth
        }
      });
      return { sessionId: json.id, cdpUrl: json.connectUrl ?? json.connectionUrl ?? null };
    },
    // Reconnect coordinates for an existing session (CDP url).
    async connect(sessionId) {
      const json = await call(`/v1/sessions/${encodeURIComponent(sessionId)}`);
      return { sessionId, cdpUrl: json.connectUrl ?? json.connectionUrl ?? null, status: json.status ?? null };
    },
    // Live-view / takeover URL (operator can watch or drive the session).
    async liveView(sessionId) {
      const json = await call(`/v1/sessions/${encodeURIComponent(sessionId)}/debug`);
      const url = json.debuggerFullscreenUrl ?? json.debuggerUrl ?? null;
      if (!url) throw domainError('BROWSERBASE_LIVEVIEW_UNAVAILABLE', 'no debugger url in vendor response');
      return url;
    },
    // Session recording / replay metadata.
    async record(sessionId) {
      return call(`/v1/sessions/${encodeURIComponent(sessionId)}/recording`);
    },
    // Release the managed session (frees the vendor slot).
    async close(sessionId) {
      await call(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        body: { projectId, status: 'REQUEST_RELEASE' }
      });
    }
  };
}
