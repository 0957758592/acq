import {
  createMongoAccountRepo,
  createMongoActionTaskRepo,
  createMongoDeviceQueueRepo,
  createMongoCampaignRepo,
  createPlatformAutomationAdapter
} from '@acq/engine-infra';
import { reconcile } from '@acq/engine-domain';
import { getPlatformCapabilities, listPlatforms } from '@acq/platform-registry';
import { createDeviceProvider } from '@acq/device-control';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { EngineDeviceQueue } from '@acq/core/models/engine-device-queue';
import { EngineDevice } from '@acq/core/models/engine-device';
import { EngineCampaign } from '@acq/core/models/engine-campaign';
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
    createPlatformAutomationAdapter,
    createDeviceProvider,
    reconcile,
    getPlatformCapabilities,
    listPlatforms,
    EngineAccount,
    EngineActionTask,
    EngineDeviceQueue,
    EngineDevice,
    EngineCampaign,
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
  const secretResolver = D.secretResolver ?? createEnvSecretResolver();

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
    deviceModel: D.EngineDevice,
    canDeviceAcceptAccount: D.canDeviceAcceptAccount,
    secretResolver,
    provider,
    automationFor,
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
      autobuyEnabled: Boolean(env.autobuyEnabled)
    },
    owner
  };
}
