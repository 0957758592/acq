import { domainError } from '@acq/engine-domain';

import { extractEmbeddedJson } from '../embedded-json.js';

// Anon-http scrape tier adapter (TZ §10.1 T1) — a REAL fetcher. Fetches the
// resolved public URL, detects a captcha wall, extracts the page's embedded JSON
// state, and hands the picked raw items to the ScrapeProvider for normalization.
// resolveUrl (platform URL) and pickItems (platform JSON path) are injected —
// the exact per-platform URL/JSON shape is verify-by-fact and supplied by the
// caller; the fetch+extract mechanism here is real.
const DEFAULT_CAPTCHA_MARKERS = ['captcha', 'not a robot', 'unusual traffic', 'verify you are human'];

export function createHttpScrapeAdapter({
  fetchImpl = globalThis.fetch,
  resolveUrl,
  pickItems,
  captchaMarkers = DEFAULT_CAPTCHA_MARKERS,
  headers = { 'user-agent': 'Mozilla/5.0', accept: 'text/html' }
} = {}) {
  if (typeof resolveUrl !== 'function') throw new Error('http scrape adapter requires resolveUrl');
  if (typeof pickItems !== 'function') throw new Error('http scrape adapter requires pickItems');

  return {
    async scrape(req) {
      const url = resolveUrl(req);
      const res = await fetchImpl(url, { headers });
      if (!res.ok) {
        throw domainError('SCRAPE_TARGET_UNAVAILABLE', `HTTP ${res.status} for ${url}`);
      }
      const html = await res.text();
      const lower = html.toLowerCase();
      if (captchaMarkers.some((m) => lower.includes(m))) {
        return { captcha: true };
      }
      const state = extractEmbeddedJson(html); // throws SCRAPE_TARGET_UNAVAILABLE if none
      const rawItems = pickItems(state, req) ?? [];
      return { rawItems: Array.isArray(rawItems) ? rawItems : [rawItems] };
    }
  };
}
