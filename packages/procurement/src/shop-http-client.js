import { domainError } from '@acq/engine-domain';

// Generic auth-aware shop HTTP client (TZ §6.4). Implements the request-by-object
// contract compileShopAdapter expects — request({ method, url, auth, body }) —
// applying each supported AUTH_KIND deterministically and resolving secret refs
// through the injected secretResolver (no plaintext creds in specs). Non-2xx is
// a hard coded error; login-password (needs an interactive session first) is an
// honest seam, never guessed.
async function applyAuth({ auth, headers, url, secretResolver }) {
  const kind = auth?.kind;
  const config = auth?.config ?? {};
  const resolve = (ref) => (ref == null ? null : secretResolver.resolve(ref));

  if (kind === 'api-key') {
    const value = await resolve(config.valueRef);
    if ((config.in ?? 'header') === 'query') {
      const u = new URL(url);
      u.searchParams.set(config.name, value ?? '');
      return { url: u.toString(), headers };
    }
    return { url, headers: { ...headers, [config.name]: value ?? '' } };
  }
  if (kind === 'bearer' || kind === 'oauth2') {
    const token = await resolve(config.tokenRef);
    return { url, headers: { ...headers, Authorization: `Bearer ${token ?? ''}` } };
  }
  if (kind === 'cookie-session') {
    const cookie = await resolve(config.cookieRef);
    return { url, headers: { ...headers, Cookie: cookie ?? '' } };
  }
  if (kind === 'login-password') {
    throw domainError('SHOP_AUTH_LOGIN_UNSUPPORTED', 'login-password requires an interactive session first');
  }
  throw domainError('SHOP_AUTH_KIND_UNSUPPORTED', `unsupported auth kind ${kind}`);
}

export function createShopHttpClient({ fetchImpl = globalThis.fetch, secretResolver, headers: baseHeaders = {}, breakerFactory = null } = {}) {
  if (!fetchImpl) throw new Error('createShopHttpClient requires a fetch implementation');
  if (!secretResolver) throw new Error('createShopHttpClient requires a secretResolver');

  // Circuit breaker per VENDOR HOST (REQUIREM §9.1): a downed shop fast-fails
  // with CIRCUIT_OPEN instead of cascading, and never trips a different shop.
  // The breaker is injected (port) so this package stays infrastructure-free.
  const breakers = new Map();
  function breakerFor(url) {
    if (!breakerFactory) return null;
    let host;
    try { host = new URL(url).host; } catch { host = String(url); }
    if (!breakers.has(host)) breakers.set(host, breakerFactory(host));
    return breakers.get(host);
  }

  return {
    async request(input) {
      const breaker = breakerFor(input?.url);
      return breaker ? breaker.execute(() => send(input)) : send(input);
    }
  };

  async function send({ method = 'GET', url, auth, body = null }) {
      const applied = await applyAuth({
        auth,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...baseHeaders },
        url,
        secretResolver
      });

      // GET/HEAD must not carry a body (fetch throws otherwise) — an endpoint
      // that needs to pass data on a GET should encode it in the URL.
      const sendsBody = body != null && method !== 'GET' && method !== 'HEAD';
      const response = await fetchImpl(applied.url, {
        method,
        headers: applied.headers,
        body: sendsBody ? JSON.stringify(body) : undefined
      });

      const text = await response.text();
      const contentType = response.headers?.get?.('content-type') || '';
      const data = text && (contentType.includes('json') || /^[[{]/.test(text.trim())) ? JSON.parse(text) : text;

      if (!response.ok) {
        throw Object.assign(domainError('SHOP_HTTP_ERROR', `shop responded ${response.status}`), {
          status: response.status,
          details: data
        });
      }
      return data;
  }
}
