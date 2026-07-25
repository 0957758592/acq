import { domainError } from '@acq/engine-domain';

// Declarative shop ACCOUNT signup + confirmation (TZ §6.3/§6.4). Registers an
// account AT a shop using an email identity (e.g. any Gmail) whose credentials
// arrive as SecretResolver REFS — never plaintext through the API. The confirm
// step reads the shop's verification code straight from the mailbox over IMAP
// (EmailCodeFetcher — works with a Gmail login/app-password) and submits it,
// then persists the resulting logged-in session so the shop's auth becomes
// `cookie-session`. The register/confirm endpoints + field maps are per-shop
// (verify-by-fact, injected via the spec); the HTTP + IMAP mechanism is real.
// Absent config is an honest coded seam, never a faked account.
function mapFields(fieldMap = {}, values = {}) {
  const body = {};
  for (const [srcKey, outKey] of Object.entries(fieldMap)) {
    if (values[srcKey] !== undefined) body[outKey] = values[srcKey];
  }
  return body;
}

export function createShopSignup({ shopRegistry, httpClient, secretResolver, emailCodeFetcherFactory, cookieSessionStore, identityStore = null, clock = { now: () => new Date() } } = {}) {
  if (!shopRegistry?.get) throw new Error('createShopSignup requires a shopRegistry');
  if (!httpClient?.request) throw new Error('createShopSignup requires an httpClient');
  if (!secretResolver?.resolve) throw new Error('createShopSignup requires a secretResolver');

  async function loadSignupSpec(shopId) {
    const shop = await shopRegistry.get(shopId);
    const signup = shop?.spec?.signup;
    if (!signup?.register) throw domainError('SHOP_SIGNUP_UNCONFIGURED', `shop ${shopId} has no signup flow`);
    const baseUrl = shop.spec.baseUrl ?? shop.baseUrl;
    return { shop, signup, baseUrl };
  }
  const resolve = (ref) => (ref == null ? undefined : secretResolver.resolve(ref));

  // `address` is the operator-friendly form: look the mailbox up in the identity
  // store (ANY provider — gmail / outlook / custom IMAP) and use its stored refs
  // + IMAP coordinates. Explicit refs still work unchanged, so existing callers
  // and specs keep working (no duplication of the credential path).
  async function identityFor({ address, emailRef, passwordRef, imapPasswordRef }) {
    if (!address) return { emailRef, passwordRef, imapPasswordRef, imapHost: null, imapPort: null };
    if (!identityStore?.credentialsFor) {
      throw domainError('EMAIL_IDENTITY_STORE_UNAVAILABLE', 'no email identity store wired');
    }
    const identity = await identityStore.credentialsFor(address);
    return {
      emailRef: identity.address,
      passwordRef: passwordRef ?? identity.passwordRef,
      imapPasswordRef: imapPasswordRef ?? identity.passwordRef,
      imapHost: identity.imapHost || null,
      imapPort: identity.imapPort ?? null
    };
  }

  return {
    // Step 1 — create the account at the shop. Credentials come as refs, or from
    // a registered email identity via `address`.
    async signup(shopId, { address = null, emailRef, passwordRef, usernameRef, extraFields = {} } = {}) {
      const { signup, baseUrl } = await loadSignupSpec(shopId);
      const ident = await identityFor({ address, emailRef, passwordRef });
      emailRef = ident.emailRef;
      passwordRef = ident.passwordRef;
      const [email, password, username] = await Promise.all([resolve(emailRef), resolve(passwordRef), resolve(usernameRef)]);
      const ep = signup.register;
      const body = { ...mapFields(ep.fieldMap, { email, password, username }), ...extraFields };
      const response = await httpClient.request({ method: ep.method ?? 'POST', url: `${baseUrl}${ep.path}`, body });
      return { shopId, email, pending: true, response };
    },

    // Step 2 — read the emailed code (IMAP) and confirm; persist the session.
    async confirm(shopId, { address = null, emailRef, imapPasswordRef, extraFields = {} } = {}) {
      const { signup, baseUrl } = await loadSignupSpec(shopId);
      if (!signup.confirm) throw domainError('SHOP_SIGNUP_UNCONFIGURED', `shop ${shopId} has no confirm step`);
      if (typeof emailCodeFetcherFactory !== 'function') throw domainError('SHOP_SIGNUP_PROVIDER_UNAVAILABLE', 'no email code fetcher wired');
      const ident = await identityFor({ address, emailRef, imapPasswordRef });
      emailRef = ident.emailRef;
      imapPasswordRef = ident.imapPasswordRef;
      const [email, imapPassword] = await Promise.all([resolve(emailRef), resolve(imapPasswordRef)]);
      // Per-identity IMAP coordinates when the provider isn't auto-inferable.
      const fetcher = emailCodeFetcherFactory({ email, password: imapPassword, host: ident.imapHost, port: ident.imapPort });
      const code = await fetcher.fetchLatestCode();
      if (!code) throw domainError('SHOP_SIGNUP_CODE_PENDING', `confirmation code for ${shopId} not arrived yet`);

      const ep = signup.confirm;
      const body = { ...mapFields(ep.fieldMap, { code, email }), ...extraFields };
      const response = await httpClient.request({ method: ep.method ?? 'POST', url: `${baseUrl}${ep.path}`, body });
      const cookies = response?.cookies ?? response?.setCookies ?? [];
      if (cookieSessionStore?.put) {
        const expiresAt = new Date(clock.now().getTime() + (signup.cookieTtlMs ?? 86_400_000));
        await cookieSessionStore.put(shopId, cookies, { expiresAt });
      }
      // The stored session is addressable as `cookie:<shopId>` — point the shop's
      // `cookie-session` auth at this ref to buy from the shop afterwards.
      return { shopId, confirmed: true, cookieRef: `cookie:${shopId}`, code };
    }
  };
}
