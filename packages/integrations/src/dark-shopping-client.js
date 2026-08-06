import { IntegrationHttpClient } from './http-client.js';

// Real dark.shopping reseller API — https://dark.shopping/developer (keystore-api
// engine). Verified live 2026-08-07. Two things differ from a plain REST vendor:
//   1. Auth is the `key` QUERY param (also accepted in a POST body), NOT a header.
//   2. Every call returns HTTP 200 with `{ success, data }`; `success:false` is the
//      real error (status/message live inside `data`) — so we unwrap + throw here.
const DEFAULT_BASE_URL = 'https://dark.shopping/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;

// Timeouts use the standard Web API AbortSignal.timeout(ms); REQUIREM forbids
// setTimeout/setInterval, so no custom timer. Retry/backoff is at the JOB level
// (EngineJobRun ledger + retry cron), never an in-process loop.
export class DarkShoppingClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!apiKey) throw new Error('Dark.shopping API key is required');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.http = new IntegrationHttpClient({
      baseUrl,
      headers: { 'User-Agent': 'Mozilla/5.0 Julio/1.0' }
    });
  }

  // key-first query string; arrays serialize as `name[]=a&name[]=b` (e.g. ids[]).
  #query(params = {}) {
    const q = new URLSearchParams();
    q.set('key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const item of value) q.append(`${key}[]`, String(item));
      } else {
        q.set(key, String(value));
      }
    }
    return q.toString();
  }

  async #get(path, params = {}) {
    const envelope = await this.http.request(`${path}?${this.#query(params)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    return this.#unwrap(envelope);
  }

  #unwrap(envelope) {
    if (envelope && envelope.success === false) {
      const data = envelope.data || {};
      throw Object.assign(new Error(data.message || 'dark.shopping API error'), {
        code: 'DARKSHOP_API_ERROR',
        status: data.status ?? 0,
        details: data
      });
    }
    return envelope?.data;
  }

  getBalance() {
    return this.#get('/user/balance');
  }

  // The SEARCH: name/description/category_id/group_id/only_in_stock/price_from|to/
  // quantity_from|to/rating_from|to/ids[]/filter_attributes[]. Returns the item array.
  async listProducts(params = {}) {
    const data = await this.#get('/product/list', params);
    return data?.items ?? [];
  }

  getProduct(id) {
    return this.#get('/product/view', { id });
  }

  listCategories(params = {}) {
    return this.#get('/category/list', params);
  }

  // Buy a specific product by id. `idempotenceId` maps to the API's own
  // idempotence_id so a retried order returns the SAME order (exactly-once).
  createOrder({ product, quantity, idempotenceId, promoCode, sendEmailCopy } = {}) {
    return this.#get('/order/create', {
      product,
      quantity,
      idempotence_id: idempotenceId,
      promo_code: promoCode,
      send_email_copy: sendEmailCopy
    });
  }

  getOrderStatus(id) {
    return this.#get('/order/status', { id });
  }

  getOrderDownload(id) {
    return this.#get('/order/download', { id });
  }

  // The delivered account is a .txt at the order's `link` — plaintext, not JSON,
  // so it bypasses the JSON client (mirrors DjekxaClient.fetchCredentialFile).
  async fetchDelivered(link) {
    const response = await this.http.fetchImpl(link, {
      headers: { 'User-Agent': 'Mozilla/5.0 Julio/1.0' },
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (response.ok === false) throw new Error(`dark.shopping delivery fetch failed ${response.status}`);
    return response.text();
  }
}

export function createDarkShoppingClient({ apiKey, baseUrl, timeoutMs } = {}) {
  return new DarkShoppingClient({ apiKey, baseUrl, timeoutMs });
}
