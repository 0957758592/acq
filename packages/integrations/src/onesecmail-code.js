import { extractVerificationCode } from './email-code.js';

// API-only code reader for 1secmail (public disposable-mail HTTP API — no IMAP,
// no auth). Same `fetchLatestCode` contract as the IMAP/Mail.tm readers so the
// confirm flow treats it like any other email type.
//
// Verify-by-fact: real HTTP calls; missing address → '' (nothing to read); a
// vendor failure is a coded seam, never a leaked INTERNAL.
function oneSecError(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export function createOneSecMailCodeReader({
  email,
  baseUrl = 'https://www.1secmail.com/api/v1/',
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  minLength = 4,
  maxLength = 8,
  keywords = ['instagram', 'tiktok', 'verification', 'security code', 'confirm', 'code']
} = {}) {
  const root = String(baseUrl).replace(/\/+$/, '');

  async function call(query) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetchImpl(`${root}/?${query}`, { signal: controller?.signal });
    } catch (err) {
      throw oneSecError('ONESECMAIL_REQUEST_FAILED', `1secmail ${query} failed: ${err.message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await response.text();
    if (!response.ok) throw oneSecError('ONESECMAIL_REQUEST_FAILED', `1secmail responded ${response.status}`);
    try {
      return JSON.parse(text || 'null');
    } catch {
      throw oneSecError('ONESECMAIL_RESPONSE_INVALID', '1secmail returned non-JSON');
    }
  }

  async function fetchLatestCode({ limit = 12 } = {}) {
    if (!email) return '';
    const [login, domain] = String(email).split('@');
    if (!login || !domain) return '';
    const q = `login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`;
    const messages = (await call(`action=getMessages&${q}`)) ?? [];
    // Newest first, bounded.
    const recent = [...messages].reverse().slice(0, limit);
    for (const summary of recent) {
      const msg = await call(`action=readMessage&${q}&id=${encodeURIComponent(summary.id)}`);
      const haystack = `${summary.subject ?? ''} ${msg?.subject ?? ''} ${msg?.textBody ?? ''} ${msg?.body ?? ''} ${msg?.htmlBody ?? ''}`;
      if (!keywords.some((k) => haystack.toLowerCase().includes(k))) continue;
      const code = extractVerificationCode(haystack, { minLength, maxLength });
      if (code) return code;
    }
    return '';
  }

  return { fetchLatestCode };
}
