// Pluggable browser backends for logins/scraping (TZ §4/§10.6 + the REQUIREM
// rule that nothing is hardcoded). ONE BrowserProvider port, many backends:
//   - `own`         — our self-hosted Puppeteer/CDP pool (default, zero per-
//                     session cost, data stays in-house; scale/stealth/proxies
//                     are operator-run).
//   - `browserbase` — managed cloud fleet: thousands of concurrent stealth CDP
//                     sessions, managed residential proxies + CAPTCHA solving +
//                     live-view (per-session cost, data transits the vendor).
// Adding a backend is a registry entry — the facade `browser.providers` op and
// every surface see it with no branching anywhere else (Open/Closed).
export const BROWSER_PROVIDERS = {
  own: {
    label: 'Own Puppeteer/CDP pool (self-hosted)',
    kind: 'self-hosted',
    requiresApiKey: false,
    baseUrl: null,
    capabilities: {
      stealth: 'basic',
      residentialProxies: 'bring-your-own',
      captcha: 'hard-stop',
      liveView: true,
      persistentContext: true,
      concurrency: 'host-bound'
    },
    note: 'Zero per-session cost, data stays in-house; scale/stealth/proxies are operator-run.'
  },
  browserbase: {
    label: 'Browserbase (managed cloud fleet)',
    kind: 'cloud',
    requiresApiKey: true,
    baseUrl: 'https://api.browserbase.com',
    capabilities: {
      stealth: 'managed',
      residentialProxies: 'managed',
      captcha: 'managed-solver',
      liveView: true,
      persistentContext: true,
      concurrency: 'thousands'
    },
    note: 'Thousands of concurrent stealth CDP sessions; per-session cost, data transits the vendor.'
  }
};

// List backends for the picker. A self-hosted backend is always ready; a cloud
// backend is `configured` only when its API key is present (verify-by-fact — we
// never report a keyless cloud backend as usable).
export function listBrowserProviders({ configured = {} } = {}) {
  return Object.entries(BROWSER_PROVIDERS).map(([provider, spec]) => ({
    provider,
    label: spec.label,
    kind: spec.kind,
    requiresApiKey: Boolean(spec.requiresApiKey),
    baseUrl: spec.baseUrl,
    capabilities: spec.capabilities,
    configured: spec.requiresApiKey ? Boolean(configured[provider]) : true,
    note: spec.note
  }));
}
