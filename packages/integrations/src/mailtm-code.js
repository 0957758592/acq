import { extractVerificationCode } from './email-code.js';

// API-only mailbox code reader for Mail.tm (and Mail.tm-compatible disposable
// providers that expose an HTTP API instead of IMAP). Same `fetchLatestCode`
// contract as EmailCodeFetcher, so the confirm flow reads codes from API-only
// email types the exact same way — no branching in the caller.
//
// Verify-by-fact: every step is a real HTTP call. Missing creds → '' (nothing to
// read); an auth/list failure is a coded seam, never a leaked INTERNAL.
function mailTmError(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export function createMailTmCodeReader({
  email,
  password,
  baseUrl = 'https://api.mail.tm',
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  minLength = 4,
  maxLength = 8,
  keywords = ['instagram', 'tiktok', 'verification', 'security code', 'confirm', 'code']
} = {}) {
  const root = String(baseUrl).replace(/\/+$/, '');

  async function call(path, { method = 'GET', body = null, token = null } = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller?.signal
      });
    } catch (err) {
      throw mailTmError('MAILTM_REQUEST_FAILED', `mail.tm ${method} ${path} failed: ${err.message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  }

  async function fetchLatestCode({ limit = 12 } = {}) {
    if (!email || !password) return '';
    const auth = await call('/token', { method: 'POST', body: { address: email, password } });
    if (!auth.ok) throw mailTmError('MAILTM_AUTH_FAILED', `mail.tm auth failed (${auth.status})`);
    const token = JSON.parse(auth.text || '{}').token;
    if (!token) throw mailTmError('MAILTM_AUTH_FAILED', 'mail.tm returned no token');

    const list = await call('/messages?page=1', { token });
    if (!list.ok) throw mailTmError('MAILTM_REQUEST_FAILED', `mail.tm message list failed (${list.status})`);
    const members = JSON.parse(list.text || '{}')['hydra:member'] ?? [];
    const recent = members.slice(0, limit);

    for (const summary of recent) {
      const full = await call(`/messages/${encodeURIComponent(summary.id)}`, { token });
      const msg = full.ok ? JSON.parse(full.text || '{}') : {};
      const haystack = `${summary.subject ?? ''} ${summary.intro ?? ''} ${msg.subject ?? ''} ${msg.text ?? ''} ${msg.html ?? ''}`;
      const lower = haystack.toLowerCase();
      if (!keywords.some((k) => lower.includes(k))) continue;
      const code = extractVerificationCode(haystack, { minLength, maxLength });
      if (code) return code;
    }
    return '';
  }

  return { fetchLatestCode };
}
