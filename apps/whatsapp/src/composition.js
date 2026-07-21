import * as infra from '@acq/whatsapp-infra';
import { createDarkShoppingClient, importDelivered } from '@acq/integrations';
import { createCloudPhoneProvider, DuoplusClient } from '@acq/device-control';
import { getRedis } from '@acq/core/db/redis';
import { publishJson } from '@acq/core/queue/rabbitmq';
import { EngineDevice } from '@acq/core/models/engine-device';
import { claimRunningDeviceLease, releaseDeviceLease } from '@acq/core/services/device-lease';
import { createStructuredLogger } from '@acq/logger';

/**
 * Composition root: wire every port adapter into a single `ctx` object.
 *
 * Pure wiring — no I/O runs at import. `getRedis` is lazy and nothing connects
 * at call time beyond what the individual factories do. Every dependency is
 * destructured from `deps` with the real import as its default so tests can
 * inject fakes for the whole graph.
 */
export function buildContext({ env, deps = {} } = {}) {
  const D = {
    createMongoAccountRepo: infra.createMongoAccountRepo,
    createMongoDeviceQueueRepo: infra.createMongoDeviceQueueRepo,
    createMongoReportRepo: infra.createMongoReportRepo,
    createRabbitJobDispatcher: infra.createRabbitJobDispatcher,
    createRabbitRedisEventBus: infra.createRabbitRedisEventBus,
    createKeychainEnvSecretResolver: infra.createKeychainEnvSecretResolver,
    createExpenseRecorder: infra.createExpenseRecorder,
    createDarkShoppingProcurementAdapter: infra.createDarkShoppingProcurementAdapter,
    createDuoplusDeviceRegistrationAdapter: infra.createDuoplusDeviceRegistrationAdapter,
    createWhatsappAutomationAdapter: infra.createWhatsappAutomationAdapter,
    systemClock: infra.systemClock,
    createDarkShoppingClient,
    importDelivered,
    createCloudPhoneProvider,
    DuoplusClient,
    getRedis,
    publishJson,
    EngineDevice,
    claimRunningDeviceLease,
    releaseDeviceLease,
    createStructuredLogger,
    ...deps
  };

  const redis = D.getRedis(env.redisUrl);
  const logger = D.createStructuredLogger({ level: env.logLevel, base: { service: 'whatsapp' } });
  const clock = D.systemClock;

  const accountRepo = D.createMongoAccountRepo();
  const deviceQueueRepo = D.createMongoDeviceQueueRepo();
  const reportRepo = D.createMongoReportRepo();
  const jobDispatcher = D.createRabbitJobDispatcher();
  const eventBus = D.createRabbitRedisEventBus({ redis, publishJson: D.publishJson });
  const secretResolver = D.createKeychainEnvSecretResolver();
  const expenseRecorder = D.createExpenseRecorder();

  const darkShoppingClient = D.createDarkShoppingClient({
    apiKey: env.procurement.apiKey,
    baseUrl: env.procurement.baseUrl
  });
  const procurement = D.createDarkShoppingProcurementAdapter({
    client: darkShoppingClient,
    importer: { importDelivered: D.importDelivered },
    // Price guards are operator-configurable via env. The buy path stays blocked
    // until WHATSAPP_EXPECTED_UNIT_USD_CENTS is set (adapter throws
    // PROCUREMENT_PRICE_DRIFT otherwise) AND the delivery format is verified —
    // deliveryFormatVerified is the separate go-live gate, still forced false here.
    config: {
      deliveryFormatVerified: false,
      expectedUnitUsdCents: env.procurement.expectedUnitUsdCents,
      maxTotalUsdCents: env.procurement.maxTotalUsdCents,
      priceDriftTolerance: env.procurement.priceDriftTolerance
    }
  });

  const duoplusClient = new D.DuoplusClient({
    apiKey: env.duoplus.apiKey,
    baseUrl: env.duoplus.baseUrl,
    minDelayMs: env.duoplus.minDelayMs
  });
  const provider = D.createCloudPhoneProvider({
    type: 'duoplus',
    apiKey: env.duoplus.apiKey,
    baseUrl: env.duoplus.baseUrl,
    minDelayMs: env.duoplus.minDelayMs
  });
  const deviceRegistration = D.createDuoplusDeviceRegistrationAdapter({
    client: duoplusClient,
    config: { whatsappTeamAppId: env.device.whatsappTeamAppId, proxy: env.device.proxy }
  });
  const automation = D.createWhatsappAutomationAdapter({ provider, secretResolver });

  return {
    accountRepo,
    deviceQueueRepo,
    reportRepo,
    procurement,
    deviceRegistration,
    automation,
    expenseRecorder,
    jobDispatcher,
    eventBus,
    secretResolver,
    clock,
    logger,
    deviceModel: D.EngineDevice,
    lease: {
      // Adapter: handlers call lease.claim(deviceId, owner) positionally, but the
      // real claimRunningDeviceLease takes an object { owner, ttlMs, deviceId }.
      claim: (deviceId, owner) => D.claimRunningDeviceLease({ deviceId, owner }),
      release: (deviceId, owner) => D.releaseDeviceLease(deviceId, owner)
    },
    owner: `whatsapp:${process.pid}`,
    config: {
      poolThreshold: env.pool.threshold,
      buyBatchSize: env.pool.buyBatchSize,
      deviceTargetDepth: env.deviceTargetDepth,
      autobuyEnabled: env.autobuyEnabled
    }
  };
}
