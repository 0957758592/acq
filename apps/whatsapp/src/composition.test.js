import { buildContext } from './composition.js';

function makeEnv() {
  return {
    redisUrl: 'redis://x',
    logLevel: 'info',
    procurement: {
      apiKey: 'k',
      baseUrl: 'b',
      expectedUnitUsdCents: 120,
      maxTotalUsdCents: 5000,
      priceDriftTolerance: 0.05
    },
    device: {
      whatsappTeamAppId: 'wa',
      proxy: { host: 'ph', port: 9090, user: 'pu', password: 'pp' }
    },
    duoplus: { apiKey: 'd', baseUrl: 'u', minDelayMs: 1100 },
    pool: { threshold: 10, buyBatchSize: 5 },
    deviceTargetDepth: 3,
    autobuyEnabled: false
  };
}

function makeDeps() {
  const calls = {};
  const record = (name) => (arg) => {
    calls[name] = arg;
    return `${name}:result`;
  };

  const importDelivered = () => 'imported';
  const publishJson = () => 'published';
  const leaseCalls = { claim: [], release: [] };
  const claimRunningDeviceLease = (arg) => {
    leaseCalls.claim.push(arg);
    return 'claim:result';
  };
  const releaseDeviceLease = (...args) => {
    leaseCalls.release.push(args);
    return 'release:result';
  };

  class DuoplusClient {
    constructor(arg) {
      calls.DuoplusClient = arg;
      this.__isDuoplusClient = true;
    }
  }

  const deps = {
    createMongoAccountRepo: record('createMongoAccountRepo'),
    createMongoDeviceQueueRepo: record('createMongoDeviceQueueRepo'),
    createMongoReportRepo: record('createMongoReportRepo'),
    createRabbitJobDispatcher: record('createRabbitJobDispatcher'),
    createRabbitRedisEventBus: record('createRabbitRedisEventBus'),
    createKeychainEnvSecretResolver: record('createKeychainEnvSecretResolver'),
    createExpenseRecorder: record('createExpenseRecorder'),
    createDarkShoppingProcurementAdapter: record('createDarkShoppingProcurementAdapter'),
    createDuoplusDeviceRegistrationAdapter: record('createDuoplusDeviceRegistrationAdapter'),
    createWhatsappAutomationAdapter: record('createWhatsappAutomationAdapter'),
    systemClock: 'systemClock:sentinel',
    createDarkShoppingClient: record('createDarkShoppingClient'),
    importDelivered,
    createCloudPhoneProvider: record('createCloudPhoneProvider'),
    DuoplusClient,
    getRedis: (url) => {
      calls.getRedis = url;
      return 'getRedis:result';
    },
    publishJson,
    createStructuredLogger: record('createStructuredLogger'),
    EngineDevice: 'EngineDevice:sentinel',
    claimRunningDeviceLease,
    releaseDeviceLease
  };

  return {
    deps,
    calls,
    importDelivered,
    publishJson,
    claimRunningDeviceLease,
    releaseDeviceLease,
    leaseCalls
  };
}

describe('buildContext', () => {
  it('wires every port adapter from injected deps into the ctx object', () => {
    const env = makeEnv();
    const { deps } = makeDeps();

    const ctx = buildContext({ env, deps });

    expect(ctx.accountRepo).toBe('createMongoAccountRepo:result');
    expect(ctx.deviceQueueRepo).toBe('createMongoDeviceQueueRepo:result');
    expect(ctx.reportRepo).toBe('createMongoReportRepo:result');
    expect(ctx.procurement).toBe('createDarkShoppingProcurementAdapter:result');
    expect(ctx.deviceRegistration).toBe('createDuoplusDeviceRegistrationAdapter:result');
    expect(ctx.automation).toBe('createWhatsappAutomationAdapter:result');
    expect(ctx.expenseRecorder).toBe('createExpenseRecorder:result');
    expect(ctx.jobDispatcher).toBe('createRabbitJobDispatcher:result');
    expect(ctx.eventBus).toBe('createRabbitRedisEventBus:result');
    expect(ctx.secretResolver).toBe('createKeychainEnvSecretResolver:result');
    expect(ctx.clock).toBe('systemClock:sentinel');
    expect(ctx.logger).toBe('createStructuredLogger:result');
  });

  it('wires the device model and owner from injected deps', () => {
    const env = makeEnv();
    const { deps } = makeDeps();

    const ctx = buildContext({ env, deps });

    expect(ctx.deviceModel).toBe('EngineDevice:sentinel');
    expect(ctx.owner).toMatch(/^whatsapp:/);
  });

  it('adapts the positional lease.claim call to the object-based claimRunningDeviceLease', () => {
    const env = makeEnv();
    const { deps, leaseCalls } = makeDeps();

    const ctx = buildContext({ env, deps });

    // Handlers call lease.claim(deviceId, owner) positionally; the real API is object-based.
    ctx.lease.claim('d1', 'owner-x');
    expect(leaseCalls.claim).toEqual([{ deviceId: 'd1', owner: 'owner-x' }]);
  });

  it('passes lease.release through positionally to releaseDeviceLease', () => {
    const env = makeEnv();
    const { deps, leaseCalls } = makeDeps();

    const ctx = buildContext({ env, deps });

    ctx.lease.release('d1', 'owner-x');
    expect(leaseCalls.release).toEqual([['d1', 'owner-x']]);
  });

  it('returns all ctx keys plus config', () => {
    const env = makeEnv();
    const { deps } = makeDeps();

    const ctx = buildContext({ env, deps });

    expect(Object.keys(ctx).sort()).toEqual(
      [
        'accountRepo',
        'automation',
        'clock',
        'config',
        'deviceModel',
        'deviceQueueRepo',
        'deviceRegistration',
        'eventBus',
        'expenseRecorder',
        'jobDispatcher',
        'lease',
        'logger',
        'owner',
        'procurement',
        'reportRepo',
        'secretResolver'
      ].sort()
    );
  });

  it('wires the event bus with the redis client and injected publishJson', () => {
    const env = makeEnv();
    const { deps, calls, publishJson } = makeDeps();

    buildContext({ env, deps });

    expect(calls.getRedis).toBe('redis://x');
    expect(calls.createRabbitRedisEventBus).toEqual({
      redis: 'getRedis:result',
      publishJson
    });
  });

  it('gates the procurement buy path with deliveryFormatVerified=false', () => {
    const env = makeEnv();
    const { deps, calls, importDelivered } = makeDeps();

    buildContext({ env, deps });

    expect(calls.createDarkShoppingClient).toEqual({ apiKey: 'k', baseUrl: 'b' });
    expect(calls.createDarkShoppingProcurementAdapter.client).toBe('createDarkShoppingClient:result');
    expect(calls.createDarkShoppingProcurementAdapter.importer).toEqual({ importDelivered });
    expect(calls.createDarkShoppingProcurementAdapter.config).toEqual({
      deliveryFormatVerified: false,
      expectedUnitUsdCents: 120,
      maxTotalUsdCents: 5000,
      priceDriftTolerance: 0.05
    });
  });

  it('wires the duoplus device registration with team app id and proxy', () => {
    const env = makeEnv();
    const { deps, calls } = makeDeps();

    buildContext({ env, deps });

    expect(calls.DuoplusClient).toEqual({ apiKey: 'd', baseUrl: 'u', minDelayMs: 1100 });
    expect(calls.createDuoplusDeviceRegistrationAdapter.config.whatsappTeamAppId).toBe('wa');
    expect(calls.createDuoplusDeviceRegistrationAdapter.config.proxy).toEqual({
      host: 'ph',
      port: 9090,
      user: 'pu',
      password: 'pp'
    });
    expect(calls.createDuoplusDeviceRegistrationAdapter.client.__isDuoplusClient).toBe(true);
  });

  it('wires the cloud phone provider and automation adapter', () => {
    const env = makeEnv();
    const { deps, calls } = makeDeps();

    buildContext({ env, deps });

    expect(calls.createCloudPhoneProvider).toEqual({
      type: 'duoplus',
      apiKey: 'd',
      baseUrl: 'u',
      minDelayMs: 1100
    });
    expect(calls.createWhatsappAutomationAdapter.provider).toBe('createCloudPhoneProvider:result');
    expect(calls.createWhatsappAutomationAdapter.secretResolver).toBe('createKeychainEnvSecretResolver:result');
  });

  it('builds the structured logger scoped to the whatsapp service', () => {
    const env = makeEnv();
    const { deps, calls } = makeDeps();

    buildContext({ env, deps });

    expect(calls.createStructuredLogger).toEqual({
      level: 'info',
      base: { service: 'whatsapp' }
    });
  });

  it('projects env values into the plain config object', () => {
    const env = makeEnv();
    const { deps } = makeDeps();

    const ctx = buildContext({ env, deps });

    expect(ctx.config).toEqual({
      poolThreshold: 10,
      buyBatchSize: 5,
      deviceTargetDepth: 3,
      autobuyEnabled: false
    });
  });
});
