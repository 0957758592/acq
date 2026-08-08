import {
  createMongoAccountRepo,
  createMongoActionTaskRepo,
  createMongoDeviceQueueRepo,
  createMongoCampaignRepo,
  createMongoScrapeResultRepo,
  createMongoTargetRepo,
  createMongoProxyRepo,
  createPlatformAutomationAdapter,
  createExpenseRecorder,
  createProxyHealthChecker,
  createGdprService
} from '@acq/engine-infra';
import { reconcile } from '@acq/engine-domain';
import { createShopRegistry, createShopHttpClient, compileShopAdapter, createLlmShopScanner, createShopSignup, createEncryptedCookieSessionStore } from '@acq/procurement';
import { createBrowserProvider, listBrowserProviders, createBrowserbaseProvider, createAiActor, createCookieSessionRestorer, puppeteerConnect } from '@acq/browser';
import { createOpenRouterClient, createLlmClient, listLlmProviders, EmailCodeFetcher, createEmailCodeReader, createDarkShoppingClient } from '@acq/integrations';
import { createVerificationResourceProvider, createHttpSmsVendor } from '@acq/account-gen';
import { getPlatformCapabilities, listPlatforms } from '@acq/platform-registry';
import { createDeviceProvider } from '@acq/device-control';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { EngineDeviceQueue } from '@acq/core/models/engine-device-queue';
import { EngineDevice } from '@acq/core/models/engine-device';
import { EngineCampaign } from '@acq/core/models/engine-campaign';
import { EngineShopSpec } from '@acq/core/models/engine-shop-spec';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';
import { EngineTarget } from '@acq/core/models/engine-target';
import { EngineProxy } from '@acq/core/models/engine-proxy';
import { EngineSelectorOverride } from '@acq/core/models/engine-selector-override';
import { EngineEmailIdentity } from '@acq/core/models/engine-email-identity';
import { EnginePurchaseClaim } from '@acq/core/models/engine-purchase-claim';
import { canDeviceAcceptAccount } from '@acq/core/utils/device-account-eligibility';
import { claimRunningDeviceLease, releaseDeviceLease } from '@acq/core/services/device-lease';
import { createSelectorStore } from './services/selector-store.js';
import { createEmailIdentityStore } from './services/email-identity-store.js';
import { createPurchaseLedger } from './services/purchase-ledger.js';
import { getRedis } from '@acq/core/db/redis';
import { createCircuitBreaker } from '@acq/core/reliability/circuit-breaker';
import { createLocalVault } from '@acq/core/security/credential-vault';
import { createUnitOfWork } from '@acq/core/db/unit-of-work';
import { createStructuredLogger } from '@acq/logger';

// Minimal env-backed secret resolver: `env:NAME` refs read process.env; any
// other ref is returned as-is (a real vault/KMS adapter plugs in via deps).
function createEnvSecretResolver() {
  return {
    async resolve(ref) {
      if (typeof ref === 'string' && ref.startsWith('env:')) return process.env[ref.slice(4)] ?? null;
      return ref;
    },
    async put(name) {
      return `env:${name}`;
    }
  };
}

/**
 * Generic engine composition root (TZ §2.3/§8). Pure wiring — no I/O at import.
 * Parameterized by active platforms; drives EVERY platform (not whatsapp-only)
 * via automationFor(platform) over an injected device provider. All deps are
 * injectable via `deps` so the whole graph can be faked.
 */
export function buildEngineContext({ env = {}, deps = {} } = {}) {
  const D = {
    createMongoAccountRepo,
    createMongoActionTaskRepo,
    createMongoDeviceQueueRepo,
    createMongoCampaignRepo,
    createMongoScrapeResultRepo,
    createMongoTargetRepo,
    createMongoProxyRepo,
    createProxyHealthChecker,
    createPlatformAutomationAdapter,
    createExpenseRecorder,
    createGdprService,
    createCircuitBreaker,
    createShopRegistry,
    createShopHttpClient,
    compileShopAdapter,
    createLlmShopScanner,
    createShopSignup,
    createEncryptedCookieSessionStore,
    createDarkShoppingClient,
    createLocalVault,
    EmailCodeFetcher,
    createEmailCodeReader,
    createOpenRouterClient,
    createLlmClient,
    listLlmProviders,
    createVerificationResourceProvider,
    createHttpSmsVendor,
    createBrowserProvider,
    listBrowserProviders,
    createBrowserbaseProvider,
    createAiActor,
    createCookieSessionRestorer,
    puppeteerConnect,
    createDeviceProvider,
    reconcile,
    getPlatformCapabilities,
    listPlatforms,
    EngineAccount,
    EngineActionTask,
    EngineDeviceQueue,
    EngineDevice,
    EngineCampaign,
    EngineShopSpec,
    EngineScrapeResult,
    EngineTarget,
    EngineProxy,
    EngineSelectorOverride,
    EngineEmailIdentity,
    EnginePurchaseClaim,
    createPurchaseLedger,
    canDeviceAcceptAccount,
    claimRunningDeviceLease,
    releaseDeviceLease,
    getRedis,
    createStructuredLogger,
    clock: { now: () => new Date() },
    ...deps
  };

  const logger = D.createStructuredLogger({ level: env.logLevel || 'info', base: { service: 'engine' } });
  const accountRepo = D.createMongoAccountRepo({ model: D.EngineAccount });
  const actionTaskRepo = D.createMongoActionTaskRepo({ model: D.EngineActionTask });
  const deviceQueueRepo = D.createMongoDeviceQueueRepo({ model: D.EngineDeviceQueue });
  const campaignRepo = D.createMongoCampaignRepo({ model: D.EngineCampaign });
  const scrapeResultRepo = D.createMongoScrapeResultRepo({ model: D.EngineScrapeResult });
  const targetRepo = D.createMongoTargetRepo({ model: D.EngineTarget, clock: D.clock });
  const proxyRepo = D.createMongoProxyRepo({ model: D.EngineProxy });
  const secretResolver = D.secretResolver ?? createEnvSecretResolver();
  // Real proxy health check (verify-by-fact: routes a request through the proxy).
  const proxyHealthChecker = D.proxyHealthChecker ?? D.createProxyHealthChecker({ secretResolver });

  // Procurement wiring (TZ §6/§8.3): a ShopRegistry over verified declarative
  // specs + an auth-aware HTTP client feed the generic acquire consumer. The
  // account GENERATE path is injected (per-platform on-device signup) — absent
  // by default, in which case that path is an honest seam.
  const shopRegistry = D.shopRegistry ?? D.createShopRegistry({ model: D.EngineShopSpec });
  // Reseller VENDOR API clients (keystore-api shops) — a registry keyed by shopId,
  // used by the read ops shop.balance/shop.search and (later) the buy path. Pluggable:
  // dark.shopping is wired from its env key; absent -> shopVendorFor is an honest
  // coded seam (SHOP_VENDOR_UNAVAILABLE). No vendor is hardcoded into any handler.
  const shopVendors = D.shopVendors ?? {};
  if (!shopVendors['dark.shopping'] && env.darkShoppingApiKey) {
    shopVendors['dark.shopping'] = D.createDarkShoppingClient({ apiKey: env.darkShoppingApiKey, baseUrl: env.darkShoppingBaseUrl });
  }
  const defaultShopId = env.defaultShopId ?? 'dark.shopping';
  // Encrypted-at-rest credential vault for delivered account secrets (§14.4).
  // Present only when a 32-byte key is configured; absent -> shop.deliver refuses
  // to store plaintext (coded CREDENTIAL_VAULT_UNAVAILABLE seam).
  const credentialVault = D.credentialVault ?? (env.secretVaultKey ? D.createLocalVault({ key: env.secretVaultKey }) : null);
  // Which procurement driver the autonomous acquire job uses: 'keystore' (real
  // dark.shopping search-buy + vaulted delivery) when a vendor is wired, else the
  // declarative 'spec' path. NOTE: this only chooses HOW to buy — WHETHER the
  // reconciler buys at all is gated separately by config.autobuyEnabled (default off).
  const acquireDriver = env.acquireDriver ?? (shopVendors[defaultShopId] ? 'keystore' : 'spec');
  const shopVendorFor = D.shopVendorFor ?? ((shopId = defaultShopId) => {
    const client = shopVendors[shopId];
    if (!client) throw Object.assign(new Error(`SHOP_VENDOR_UNAVAILABLE: no vendor client for '${shopId ?? defaultShopId}'`), { code: 'SHOP_VENDOR_UNAVAILABLE' });
    return client;
  });
  // Browserbase-class session provider (lazy: Chromium launches on first
  // createSession). debugPort enables the live-view devtools URL.
  const browserProvider = D.browserProvider ?? D.createBrowserProvider({
    maxConcurrent: env.browserConcurrency ?? 4,
    debugPort: env.browserDebugPort ?? 0
  });
  // Pluggable browser BACKENDS behind the one port (own pool default, Browserbase
  // cloud when keyed). `browserBackendFor({provider})` returns the self-hosted
  // pool or a Browserbase adapter; keyless cloud selection fails safe (coded
  // BROWSERBASE_UNCONFIGURED). `browserProviders()` powers the browser.providers
  // op on every surface. No backend is hardcoded into any subsystem.
  const browserKeys = D.browserKeys ?? env.browserKeys ?? (env.browserbaseApiKey ? { browserbase: env.browserbaseApiKey } : {});
  const defaultBrowserProvider = env.browserProvider ?? 'own';
  const browserProviders = () => D.listBrowserProviders({ configured: browserKeys });
  const browserBackendFor = D.browserBackendFor ?? (({ provider = defaultBrowserProvider } = {}) => {
    if (provider === 'own') return browserProvider;
    if (provider === 'browserbase') {
      const apiKey = browserKeys.browserbase;
      if (!apiKey) throw Object.assign(new Error("BROWSERBASE_UNCONFIGURED: no API key for 'browserbase'"), { code: 'BROWSERBASE_UNCONFIGURED' });
      return D.createBrowserbaseProvider({ apiKey, projectId: env.browserbaseProjectId ?? null });
    }
    throw Object.assign(new Error(`BROWSER_PROVIDER_UNSUPPORTED: unknown browser provider '${provider}'`), { code: 'BROWSER_PROVIDER_UNSUPPORTED' });
  });
  // Cookie/browser (desktop) login: restore a browser session from an account's
  // vaulted cookies (the LinkedIn-class path that bypasses on-device anti-automation).
  // Bound to the browserbase backend; absent a browser key -> account.browserLogin is
  // an honest seam (BROWSER_LOGIN_UNAVAILABLE).
  const cookieSessionRestore =
    D.cookieSessionRestore ??
    (browserKeys.browserbase
      ? D.createCookieSessionRestorer({ browserProvider: browserBackendFor({ provider: 'browserbase' }), connect: D.puppeteerConnect })
      : null);

  // Stagehand-style observe→act for logins, bound to a chosen browser backend +
  // LLM vendor at call time (survives DOM drift). Absent LLM key -> coded seam.
  const aiActorFor = D.aiActorFor ?? (({ provider, model, browserProvider: bp } = {}) =>
    D.createAiActor({ llm: llmFor({ provider, model }), browser: bp ?? browserProvider }));
  // AI shop scanner (TZ §6.3 SCAN): reads shop pages via the browser + an LLM to
  // PROPOSE a spec. Wired only when an LLM key is present; absent -> shop.scan is
  // an honest seam (SHOP_SCANNER_UNAVAILABLE). AI proposes; validation is by-fact.
  // Pluggable AI backends: per-provider keys (openai default, anthropic, google,
  // openrouter, custom). `llmFor({provider, model})` mints a client for ANY of
  // them, so every AI-using subsystem — and any surface passing provider/model —
  // can pick the vendor and model at call time. No provider is hardcoded.
  const llmKeys = D.llmKeys ?? env.llmKeys ?? (env.llmApiKey ? { [env.llmProvider ?? 'openai']: env.llmApiKey } : {});
  const defaultLlmProvider = env.llmProvider ?? (Object.keys(llmKeys)[0] ?? 'openai');
  const llmFor = D.llmFor ?? (({ provider = defaultLlmProvider, model = env.llmModel ?? null, baseUrl = env.llmBaseUrl ?? null } = {}) => {
    const apiKey = llmKeys[provider];
    if (!apiKey) throw Object.assign(new Error(`LLM_PROVIDER_UNCONFIGURED: no API key for '${provider}'`), { code: 'LLM_PROVIDER_UNCONFIGURED' });
    return D.createLlmClient({ provider, apiKey, model, baseUrl });
  });
  const llmProviders = () => D.listLlmProviders({ configured: llmKeys });
  // Read shop text through a SELECTED browser backend (own pool / Browserbase) —
  // so the AI scan is pluggable, not pinned to the self-hosted pool.
  const fetchShopTextVia = (backend) => async ({ shopUrl }) => {
    const { sessionId } = await backend.createSession({});
    try {
      return await backend.extract(sessionId, { url: shopUrl, pageFunction: () => document.body.innerText });
    } finally {
      await backend.close(sessionId);
    }
  };
  const fetchShopText = fetchShopTextVia(browserProvider);
  // Build a scanner bound to a specific LLM vendor/model AND browser backend for a
  // single call. `browserProvider` picks own/browserbase; keyless cloud fails safe.
  const scannerFor = D.scannerFor ?? (({ provider, model, browserProvider: bp } = {}) =>
    D.createLlmShopScanner({
      llmClient: llmFor({ provider, model }),
      fetchShopText: bp ? fetchShopTextVia(browserBackendFor({ provider: bp })) : fetchShopText
    }));

  const shopScanner =
    D.shopScanner ??
    (Object.keys(llmKeys).length
      ? D.createLlmShopScanner({ llmClient: llmFor({}), fetchShopText })
      : null);
  // Per-vendor circuit breaker (REQUIREM §9.1): a downed shop fast-fails with
  // CIRCUIT_OPEN instead of cascading; each host gets its own breaker.
  const httpClient = D.httpClient ?? D.createShopHttpClient({ secretResolver, tracer: D.tracer ?? null, breakerFactory: () => D.createCircuitBreaker({ failureThreshold: env.breakerThreshold ?? 5, cooldownMs: env.breakerCooldownMs ?? 30_000 }) });
  const expenseRecorder = D.expenseRecorder ?? D.createExpenseRecorder();
  // Shop ACCOUNT signup + confirmation (§6.3/§6.4): register at a shop via an
  // email identity (credentials as refs), confirm by reading the emailed code
  // over IMAP (any Gmail login/app-password), persist the resulting session. The
  // per-shop signup endpoints live in the spec; absent -> honest coded seam.
  // Operator-owned mailboxes used for shop signup/confirmation (ANY provider).
  const emailIdentityStore = D.emailIdentityStore ?? createEmailIdentityStore({ model: D.EngineEmailIdentity });
  // Exactly-once money-path ledger for the acquire handler (REQUIREM §2.1/§3.4).
  const purchaseLedger = D.purchaseLedger ?? D.createPurchaseLedger({ model: D.EnginePurchaseClaim });
  const cookieSessionStore =
    D.cookieSessionStore ?? (env.cookieSessionKey ? D.createEncryptedCookieSessionStore({ key: env.cookieSessionKey }) : null);
  const shopSignup =
    D.shopSignup ??
    D.createShopSignup({
      shopRegistry,
      httpClient,
      secretResolver,
      // Reader-by-provider: IMAP for normal mailboxes, HTTP API for API-only
      // types (Mail.tm) — one fetchLatestCode contract, every email type works.
      emailCodeFetcherFactory: ({ email, password, accessToken, host, port, provider }) => D.createEmailCodeReader({ email, password, accessToken: accessToken || null, host: host || null, port: port || null, provider: provider || null }),
      identityStore: emailIdentityStore,
      cookieSessionStore
    });
  // Verification resource provider (SMS/email). Wired from an env-configured SMS
  // vendor (declarative endpoints + auth); absent -> verification.rent is an
  // honest coded seam (VERIFICATION_PROVIDER_UNAVAILABLE).
  const verificationProvider =
    D.verificationProvider ??
    (env.smsVendor?.endpoints
      ? D.createVerificationResourceProvider({
          sms: D.createHttpSmsVendor({ httpClient, endpoints: env.smsVendor.endpoints, map: env.smsVendor.map ?? {} })
        })
      : null);

  // Device provider from env (duoplus/vmos/geelark + creds). Absent -> null, in
  // which case automationFor is null and the online/action/probe handlers
  // fail-safe rather than pretending (verify-by-fact: no device, no guessing).
  const provider = D.provider ?? (env.deviceProvider?.type ? D.createDeviceProvider(env.deviceProvider) : null);
  // On-device selector override store — operators tune login/action/report
  // selectors for a live app build via device.selectors.*; the adapter resolves
  // them per platform and passes them into driver calls (opts.selectors).
  const selectorStore = D.selectorStore ?? createSelectorStore({ model: D.EngineSelectorOverride });
  // Explicit transaction boundary for the GDPR cascade (REQUIREM §2.5).
  const unitOfWork = D.unitOfWork ?? (D.EngineAccount?.db?.startSession ? createUnitOfWork({ connection: D.EngineAccount.db, logger }) : null);
  const gdpr = D.gdpr ?? D.createGdprService({ accountModel: D.EngineAccount, actionTaskModel: D.EngineActionTask, scrapeResultModel: D.EngineScrapeResult, unitOfWork });
  const automationFor =
    D.automationFor ??
    (provider
      ? (platform) => D.createPlatformAutomationAdapter({ platform, provider, secretResolver, selectorProvider: selectorStore, tracer: D.tracer ?? null })
      : null);

  const activePlatforms = (env.platforms && env.platforms.length ? env.platforms : D.listPlatforms())
    .filter((p) => {
      try {
        D.getPlatformCapabilities(p);
        return true;
      } catch {
        return false;
      }
    });

  const owner = `engine:${env.pid ?? 'local'}`;

  return {
    logger,
    clock: D.clock,
    accountRepo,
    actionTaskRepo,
    deviceQueueRepo,
    campaignRepo,
    scrapeResultRepo,
    targetRepo,
    proxyRepo,
    proxyHealthChecker,
    verificationProvider,
    browserProvider,
    shopScanner,
    deviceModel: D.EngineDevice,
    canDeviceAcceptAccount: D.canDeviceAcceptAccount,
    secretResolver,
    provider,
    automationFor,
    shopRegistry,
    shopVendorFor,
    defaultShopId,
    credentialVault,
    acquireDriver,
    // Plain URL→text fetcher (Telegram Drive delivery download; overridable).
    fetchText: D.fetchText ?? (async (url) => {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      if (!res.ok) throw Object.assign(new Error(`FETCH_FAILED: ${res.status} for ${url}`), { code: 'FETCH_FAILED' });
      return res.text();
    }),
    cookieSessionRestore,
    shopSignup,
    selectorStore,
    emailIdentityStore,
    purchaseLedger,
    gdpr,
    llmFor,
    llmProviders,
    scannerFor,
    defaultLlmProvider,
    browserProviders,
    defaultBrowserProvider,
    browserBackendFor,
    aiActorFor,
    httpClient,
    compileShopAdapter: D.compileShopAdapter,
    expenseRecorder,
    accountGenerator: D.accountGenerator ?? null,
    eventBus: D.eventBus ?? null,
    dispatchScrape: D.dispatchScrape ?? null,
    jobDispatcher: D.jobDispatcher ?? null,
    reconcile: D.reconcile,
    capabilitiesOf: D.getPlatformCapabilities,
    activePlatforms,
    lease: {
      claim: (deviceId) => D.claimRunningDeviceLease({ deviceId, owner }),
      release: (deviceId) => D.releaseDeviceLease(deviceId, owner)
    },
    config: {
      poolThreshold: env.poolThreshold ?? 10,
      buyBatchSize: env.buyBatchSize ?? 5,
      autobuyEnabled: Boolean(env.autobuyEnabled),
      maxUnitPriceUsdCents: env.maxUnitPriceUsdCents ?? null,
      expectedUnitUsdCents: env.expectedUnitUsdCents ?? null,
      // FX for converting reseller-vendor balances/prices (RUB) to the USD-cents
      // the guards use. Configurable, never hardcoded; null -> no conversion.
      rubPerUsd: env.rubPerUsd ?? null,
      // Defaults for AUTONOMOUS buys (keystore driver): prefer high-rated suppliers
      // (rating >= 4.5) with the reliable ranking. Every field overridable via env.
      buyDefaults: {
        strategy: env.buyStrategy ?? 'reliable',
        minRating: env.buyMinRating ?? 4.5,
        // Hard price cap per account (operator rule): never spend >100 RUB/account.
        maxUnitPriceRub: env.buyMaxUnitPriceRub ?? 100,
        maxInvalidPercent: env.buyMaxInvalidPercent ?? null,
        country: env.buyCountry ?? null
      },
      priceDriftTolerance: env.priceDriftTolerance ?? 0.2,
      maxTotalUsdCents: env.maxTotalUsdCents ?? null,
      deviceTargetDepth: env.deviceTargetDepth ?? 3,
      // Warmup + proxy planning are opt-in: default target 0 / disabled keeps the
      // reconciler from emitting warmup/proxy intents until an operator enables
      // them (and a proxy pool is populated).
      warmupTargetLevel: env.warmupTargetLevel ?? 0,
      // Proxy enforcement for on-device login (operator rule): 'required' (default)
      // blocks bring-online unless the device egresses through a proxy — accounts
      // never log in on a bare IP; 'off' allows login without a proxy. Applies to
      // ALL platforms/accounts; overridable per bring-online job.
      proxyMode: env.proxyMode ?? 'required',
      proxyEnabled: Boolean(env.proxyEnabled),
      proxyPoolThreshold: env.proxyPoolThreshold ?? 0,
      proxyBatchSize: env.proxyBatchSize ?? 1,
      proxyGeo: env.proxyGeo ?? null
    },
    owner
  };
}
