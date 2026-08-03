import { domainError } from '@acq/engine-domain';

// Generic auth-aware shop HTTP client (TZ §6.4). Implements the request-by-object
// contract compileShopAdapter expects — request({ method, url, auth, body }) —
// applying each supported AUTH_KIND deterministically and resolving secret refs
// through the injected secretResolver (no plaintext creds in specs). Non-2xx is
// a hard coded error; login-password (needs an interactive session first) is an
// honest seam, never guessed.
function dig(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Log in with the credential refs and return the session headers (Cookie or
// Authorization), per the shop's described login flow. The session is cached so
// we don't re-login on every request. A failed login is a coded seam — never a
// false/empty session.
async function loginForSession({ config, url, fetchImpl, resolve, sessionCache }) {
  if (!config.loginUrl && !config.loginPath) {
    throw domainError('SHOP_AUTH_LOGIN_UNSUPPORTED', 'login-password requires a described login flow (loginPath/loginUrl)');
  }
  const loginUrl = config.loginUrl || new URL(config.loginPath, url).toString();
  const cacheKey = `${loginUrl}::${config.emailRef ?? ''}`;
  const cached = sessionCache?.get(cacheKey);
  if (cached) return cached;

  const [email, password] = await Promise.all([resolve(config.emailRef), resolve(config.passwordRef)]);
  const fieldMap = config.fieldMap ?? { email: 'email', password: 'password' };
  const loginBody = { [fieldMap.email ?? 'email']: email, [fieldMap.password ?? 'password']: password, ...(config.extraFields ?? {}) };
  const resp = await fetchImpl(loginUrl, {
    method: config.method ?? 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(loginBody)
  });
  if (!resp.ok) throw domainError('SHOP_AUTH_LOGIN_FAILED', `shop login failed (${resp.status})`);

  const session = config.session ?? { from: 'cookie' };
  let sessionHeaders;
  if (session.from === 'body') {
    const text = await resp.text();
    const json = text ? JSON.parse(text) : {};
    const token = session.tokenPath ? dig(json, session.tokenPath) : json.token;
    if (!token) throw domainError('SHOP_AUTH_LOGIN_FAILED', 'no token in login response body');
    sessionHeaders = { [session.header ?? 'Authorization']: `${session.scheme ?? 'Bearer'} ${token}`.trim() };
  } else {
    const setCookie = resp.headers?.get?.('set-cookie') || '';
    const cookie = String(setCookie).split(';')[0].trim(); // name=value, drop attributes
    if (!cookie) throw domainError('SHOP_AUTH_LOGIN_FAILED', 'no session cookie in login response');
    sessionHeaders = { Cookie: cookie };
  }
  sessionCache?.set(cacheKey, sessionHeaders);
  return sessionHeaders;
}

async function applyAuth({ auth, headers, url, secretResolver, fetchImpl, sessionCache }) {
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
    const sessionHeaders = await loginForSession({ config, url, fetchImpl, resolve, sessionCache });
    return { url, headers: { ...headers, ...sessionHeaders } };
  }
  throw domainError('SHOP_AUTH_KIND_UNSUPPORTED', `unsupported auth kind ${kind}`);
}

export function createShopHttpClient({ fetchImpl = globalThis.fetch, secretResolver, headers: baseHeaders = {}, breakerFactory = null, tracer = null } = {}) {
  if (!fetchImpl) throw new Error('createShopHttpClient requires a fetch implementation');
  if (!secretResolver) throw new Error('createShopHttpClient requires a secretResolver');

  // Circuit breaker per VENDOR HOST (REQUIREM §9.1): a downed shop fast-fails
  // with CIRCUIT_OPEN instead of cascading, and never trips a different shop.
  // The breaker is injected (port) so this package stays infrastructure-free.
  const breakers = new Map();
  // Cached shop sessions for login-password auth (avoid re-login per request).
  const sessionCache = new Map();
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
      const call = () => (breaker ? breaker.execute(() => send(input)) : send(input));
      // vendor-call span (TZ §15) — the leaf of job → device-op → vendor-call.
      if (!tracer?.withSpan) return call();
      let host; try { host = new URL(input?.url).host; } catch { host = 'unknown'; }
      return tracer.withSpan('vendor.shopRequest', { traceId: input?.correlationId, attributes: { host, method: input?.method ?? 'GET' } }, call);
    }
  };

  async function send({ method = 'GET', url, auth, body = null }) {
      const applied = await applyAuth({
        auth,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...baseHeaders },
        url,
        secretResolver,
        fetchImpl,
        sessionCache
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
