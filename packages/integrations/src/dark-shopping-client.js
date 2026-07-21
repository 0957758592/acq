import { IntegrationHttpClient } from './http-client.js';

// ⚠️ Best-effort external endpoints — VERIFY the real base URL and paths at go-live.
const DEFAULT_BASE_URL = 'https://dark.shopping/api';
const DEFAULT_TIMEOUT_MS = 15000;

// Timeouts use the standard Web API AbortSignal.timeout(ms) (Node 18+); REQUIREM
// forbids setTimeout/setInterval, so no custom timer is used here.
//
// Retry/backoff is intentionally NOT done in-process (a backoff delay would need
// setTimeout, which REQUIREM forbids). Transient failures are retried at the JOB
// level via the EngineJobRun ledger + retry cron (the Plan 5 procurement job runs
// under it). Do not add an in-process retry loop.
export class DarkShoppingClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!apiKey) throw new Error('Dark.shopping API key is required');
    this.timeoutMs = timeoutMs;
    this.http = new IntegrationHttpClient({
      baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 Julio/1.0'
      }
    });
  }

  #req(path, opts = {}) {
    return this.http.request(path, { ...opts, signal: AbortSignal.timeout(this.timeoutMs) });
  }

  getBalance() {
    return this.#req('/balance');
  }

  listOffers() {
    return this.#req('/offers');
  }

  purchase(quantity) {
    return this.#req('/orders', { method: 'POST', body: { quantity } });
  }

  getOrder(orderId) {
    return this.#req(`/orders/${orderId}`);
  }

  fetchDelivered({ orderId }) {
    return this.#req(`/orders/${orderId}/delivery`);
  }
}

export function createDarkShoppingClient({ apiKey, baseUrl, timeoutMs } = {}) {
  return new DarkShoppingClient({ apiKey, baseUrl, timeoutMs });
}
