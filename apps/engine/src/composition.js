import {
  createMongoAccountRepo,
  createMongoActionTaskRepo,
  createMongoDeviceQueueRepo,
  createMongoCampaignRepo,
  createMongoScrapeResultRepo,
  createMongoProxyRepo,
  createPlatformAutomationAdapter,
  createExpenseRecorder,
  createProxyHealthChecker,
  createGdprService
} from '@acq/engine-infra';
import { reconcile } from '@acq/engine-domain';
import { createShopRegistry, createShopHttpClient, compileShopAdapter, createLlmShopScanner, createShopSignup, createEncryptedCookieSessionStore } from '@acq/procurement';
import { createBrowserProvider, listBrowserProviders, createBrowserbaseProvider, createAiActor } from '@acq/browser';
import { createOpenRouterClient, createLlmClient, listLlmProviders, EmailCodeFetcher } from '@acq/integrations';
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
import { EngineProxy } from '@acq/core/models/engine-proxy';
import { EngineSelectorOverride } from '@acq/core/models/engine-selector-override';
import { EngineEmailIdentity } from '@acq/core/models/engine-email-identity';
import { canDeviceAcceptAccount } from '@acq/core/utils/device-account-eligibility';
import { claimRunningDeviceLease, releaseDeviceLease } from '@acq/core/services/device-lease';
import { createSelectorStore } from './services/selector-store.js';
import { createEmailIdentityStore } from './services/email-identity-store.js';
import { getRedis } from '@acq/core/db/redis';
import { createCircuitBreaker } from '@acq/core/reliability/circuit-breaker';
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
    EmailCodeFetcher,
    createOpenRouterClient,
    createLlmClient,
    listLlmProviders,
    createVerificationResourceProvider,
    createHttpSmsVendor,
    createBrowserProvider,
    listBrowserProviders,
    createBrowserbaseProvider,
    createAiActor,
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
    EngineProxy,
    EngineSelectorOverride,
    EngineEmailIdentity,
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
  const proxyRepo = D.createMongoProxyRepo({ model: D.EngineProxy });
  const secretResolver = D.secretResolver ?? createEnvSecretResolver();
  // Real proxy health check (verify-by-fact: routes a request through the proxy).
  const proxyHealthChecker = D.proxyHealthChecker ?? D.createProxyHealthChecker({ secretResolver });

  // Procurement wiring (TZ §6/§8.3): a ShopRegistry over verified declarative
  // specs + an auth-aware HTTP client feed the generic acquire consumer. The
  // account GENERATE path is injected (per-platform on-device signup) — absent
  // by default, in which case that path is an honest seam.
  const shopRegistry = D.shopRegistry ?? D.createShopRegistry({ model: D.EngineShopSpec });
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
  const fetchShopText = async ({ shopUrl }) => {
    const { sessionId } = await browserProvider.createSession({});
    try {
      return await browserProvider.extract(sessionId, { url: shopUrl, pageFunction: () => document.body.innerText });
    } finally {
      await browserProvider.close(sessionId);
    }
  };
  // Build a scanner bound to a specific vendor/model for a single call.
  const scannerFor = D.scannerFor ?? (({ provider, model } = {}) => D.createLlmShopScanner({ llmClient: llmFor({ provider, model }), fetchShopText }));

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
  const cookieSessionStore =
    D.cookieSessionStore ?? (env.cookieSessionKey ? D.createEncryptedCookieSessionStore({ key: env.cookieSessionKey }) : null);
  const shopSignup =
    D.shopSignup ??
    D.createShopSignup({
      shopRegistry,
      httpClient,
      secretResolver,
      emailCodeFetcherFactory: ({ email, password, host, port }) => new D.EmailCodeFetcher({ email, password, host: host || undefined, port: port || undefined }),
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
    shopSignup,
    selectorStore,
    emailIdentityStore,
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
      priceDriftTolerance: env.priceDriftTolerance ?? 0.2,
      maxTotalUsdCents: env.maxTotalUsdCents ?? null,
      deviceTargetDepth: env.deviceTargetDepth ?? 3,
      // Warmup + proxy planning are opt-in: default target 0 / disabled keeps the
      // reconciler from emitting warmup/proxy intents until an operator enables
      // them (and a proxy pool is populated).
      warmupTargetLevel: env.warmupTargetLevel ?? 0,
      proxyEnabled: Boolean(env.proxyEnabled),
      proxyPoolThreshold: env.proxyPoolThreshold ?? 0,
      proxyBatchSize: env.proxyBatchSize ?? 1,
      proxyGeo: env.proxyGeo ?? null
    },
    owner
  };
}
