import { loadWhatsappEnv } from './env.js';

describe('loadWhatsappEnv', () => {
  it('coerces types and applies defaults from an explicit env object', () => {
    const cfg = loadWhatsappEnv({
      WHATSAPP_AUTOBUY_ENABLED: 'true',
      WHATSAPP_POOL_THRESHOLD: '7',
      MONGODB_URI: 'mongodb://x'
    });

    expect(cfg.autobuyEnabled).toBe(true);
    expect(cfg.poolThreshold).toBe(7);
    expect(cfg.mongodbUri).toBe('mongodb://x');
    expect(cfg.probeCron).toBe('*/15 * * * *');
    expect(cfg.mcpHttpPort).toBe(7300);
    expect(cfg.healthPort).toBe(7301);
  });

  it('reads the orchestrator health port, defaulting to 7301', () => {
    expect(loadWhatsappEnv({}).healthPort).toBe(7301);
    expect(loadWhatsappEnv({ WHATSAPP_HEALTH_PORT: '7999' }).healthPort).toBe(7999);
  });

  it('defaults autobuyEnabled to false when unset', () => {
    const cfg = loadWhatsappEnv({});
    expect(cfg.autobuyEnabled).toBe(false);
  });

  it('exposes grouped config the composition needs', () => {
    const cfg = loadWhatsappEnv({
      WHATSAPP_POOL_THRESHOLD: '9',
      WHATSAPP_BUY_BATCH_SIZE: '4',
      WHATSAPP_DEVICE_TARGET_DEPTH: '2',
      DARK_SHOPPING_API_KEY: 'k',
      DARK_SHOPPING_BASE_URL: 'https://dark.example',
      WHATSAPP_TEAM_APP_ID: 'team-1'
    });

    expect(cfg.pool).toEqual({ threshold: 9, buyBatchSize: 4 });
    expect(cfg.deviceTargetDepth).toBe(2);
    expect(cfg.procurement).toEqual({
      apiKey: 'k',
      baseUrl: 'https://dark.example',
      expectedUnitUsdCents: undefined,
      maxTotalUsdCents: undefined,
      priceDriftTolerance: 0.1
    });
    expect(cfg.device).toEqual({ whatsappTeamAppId: 'team-1', proxy: null });
  });

  it('wires procurement price guards from the environment', () => {
    const cfg = loadWhatsappEnv({
      WHATSAPP_EXPECTED_UNIT_USD_CENTS: '120',
      WHATSAPP_MAX_TOTAL_USD_CENTS: '5000',
      WHATSAPP_PRICE_DRIFT_TOLERANCE: '0.05'
    });

    expect(cfg.procurement.expectedUnitUsdCents).toBe(120);
    expect(cfg.procurement.maxTotalUsdCents).toBe(5000);
    expect(cfg.procurement.priceDriftTolerance).toBe(0.05);
  });

  it('defaults the price drift tolerance to 0.1 when unset', () => {
    const cfg = loadWhatsappEnv({});
    expect(cfg.procurement.priceDriftTolerance).toBe(0.1);
    expect(cfg.procurement.expectedUnitUsdCents).toBeUndefined();
    expect(cfg.procurement.maxTotalUsdCents).toBeUndefined();
  });

  it('builds a host-based proxy from DUOPLUS_PROXY_* env', () => {
    const cfg = loadWhatsappEnv({
      DUOPLUS_PROXY_HOST: 'h',
      DUOPLUS_PROXY_PORT: '8080',
      DUOPLUS_PROXY_USER: 'u',
      DUOPLUS_PROXY_PASSWORD: 'p'
    });

    expect(cfg.device.proxy).toEqual({ host: 'h', port: 8080, user: 'u', password: 'p' });
  });

  it('prefers an explicit proxy id when DUOPLUS_PROXY_ID is set', () => {
    const cfg = loadWhatsappEnv({ DUOPLUS_PROXY_ID: 'px1' });
    expect(cfg.device.proxy).toEqual({ id: 'px1' });
  });

  it('leaves device.proxy null when no proxy env is set', () => {
    const cfg = loadWhatsappEnv({});
    expect(cfg.device.proxy).toBeNull();
  });

  it('no longer exposes the dead whatsappApkUrl config', () => {
    const cfg = loadWhatsappEnv({ WHATSAPP_APK_URL: 'https://apk.example/app.apk' });
    expect('whatsappApkUrl' in cfg).toBe(false);
  });

  it('groups DuoPlus creds with defaults for the composition root', () => {
    const cfg = loadWhatsappEnv({});

    expect(cfg.duoplus).toEqual({
      apiKey: undefined,
      baseUrl: 'https://openapi.duoplus.net',
      minDelayMs: 1100
    });
  });

  it('reads DuoPlus creds from the environment', () => {
    const cfg = loadWhatsappEnv({
      DUOPLUS_API_KEY: 'dp-key',
      DUOPLUS_API_BASE_URL: 'https://duoplus.example',
      DUOPLUS_MIN_DELAY_MS: '2000'
    });

    expect(cfg.duoplus).toEqual({
      apiKey: 'dp-key',
      baseUrl: 'https://duoplus.example',
      minDelayMs: 2000
    });
  });
});
