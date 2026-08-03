import { buildEngineContext } from './composition.js';

describe('buildEngineContext (pure wiring)', () => {
  const deps = {
    createMongoAccountRepo: ({ model }) => ({ __model: model }),
    createMongoActionTaskRepo: ({ model }) => ({ __model: model }),
    reconcile: () => [],
    getPlatformCapabilities: (p) => {
      if (p === 'whatsapp' || p === 'telegram') return { platform: p };
      throw new Error('unknown');
    },
    listPlatforms: () => ['whatsapp', 'telegram'],
    EngineAccount: { name: 'EngineAccount' },
    getRedis: () => ({}),
    createStructuredLogger: () => ({ info: () => {} })
  };

  it('wires the account repo with the injected model', () => {
    const ctx = buildEngineContext({ env: {}, deps });
    expect(ctx.accountRepo.__model).toEqual({ name: 'EngineAccount' });
    expect(typeof ctx.reconcile).toBe('function');
  });

  it('resolves active platforms from the registry, dropping unknown ones', () => {
    const ctx = buildEngineContext({ env: { platforms: ['whatsapp', 'ghost'] }, deps });
    expect(ctx.activePlatforms).toEqual(['whatsapp']);
  });

  it('defaults active platforms to all registered when none configured', () => {
    const ctx = buildEngineContext({ env: {}, deps });
    expect(ctx.activePlatforms).toEqual(['whatsapp', 'telegram']);
  });

  it('carries pool config from env', () => {
    const ctx = buildEngineContext({ env: { poolThreshold: 3, autobuyEnabled: true }, deps });
    expect(ctx.config).toMatchObject({ poolThreshold: 3, autobuyEnabled: true });
  });

  it('enables the Browserbase backend from env.browserbaseApiKey (config path must exist)', () => {
    const off = buildEngineContext({ env: {}, deps });
    expect(off.browserProviders().find((p) => p.provider === 'browserbase').configured).toBe(false);

    const on = buildEngineContext({ env: { browserbaseApiKey: 'bb-key', browserbaseProjectId: 'proj-1' }, deps });
    expect(on.browserProviders().find((p) => p.provider === 'browserbase').configured).toBe(true);
    // and it actually resolves the cloud backend instead of failing UNCONFIGURED
    expect(() => on.browserBackendFor({ provider: 'browserbase' })).not.toThrow();
  });
});
