import {
  createMongoAccountRepo,
  createMongoActionTaskRepo,
  createMongoDeviceQueueRepo,
  createMongoCampaignRepo,
  createMongoScrapeResultRepo,
  createMongoProxyRepo,
  createPlatformAutomationAdapter,
  createExpenseRecorder,
  createProxyHealthChecker
} from '@acq/engine-infra';
import { reconcile } from '@acq/engine-domain';
import { createShopRegistry, createShopHttpClient, compileShopAdapter, createLlmShopScanner } from '@acq/procurement';
import { createBrowserProvider } from '@acq/browser';
import { createOpenRouterClient } from '@acq/integrations';
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
import { canDeviceAcceptAccount } from '@acq/core/utils/device-account-eligibility';
import { claimRunningDeviceLease, releaseDeviceLease } from '@acq/core/services/device-lease';
import { getRedis } from '@acq/core/db/redis';
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
    createShopRegistry,
    createShopHttpClient,
    compileShopAdapter,
    createLlmShopScanner,
    createOpenRouterClient,
    createVerificationResourceProvider,
    createHttpSmsVendor,
    createBrowserProvider,
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
  // AI shop scanner (TZ §6.3 SCAN): reads shop pages via the browser + an LLM to
  // PROPOSE a spec. Wired only when an LLM key is present; absent -> shop.scan is
  // an honest seam (SHOP_SCANNER_UNAVAILABLE). AI proposes; validation is by-fact.
  const shopScanner =
    D.shopScanner ??
    (env.llmApiKey
      ? D.createLlmShopScanner({
          llmClient: D.createOpenRouterClient({ apiKey: env.llmApiKey, model: env.llmModel }),
          fetchShopText: async ({ shopUrl }) => {
            const { sessionId } = await browserProvider.createSession({});
            try {
              return await browserProvider.extract(sessionId, { url: shopUrl, pageFunction: () => document.body.innerText });
            } finally {
              await browserProvider.close(sessionId);
            }
          }
        })
      : null);
  const httpClient = D.httpClient ?? D.createShopHttpClient({ secretResolver });
  const expenseRecorder = D.expenseRecorder ?? D.createExpenseRecorder();
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
  const automationFor =
    D.automationFor ??
    (provider
      ? (platform) => D.createPlatformAutomationAdapter({ platform, provider, secretResolver })
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
