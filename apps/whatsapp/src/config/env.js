import { defineSchema, loadConfig, rules } from '@acq/config';
import { loadRootEnv } from '@acq/config/env';

loadRootEnv();

const schema = defineSchema({
  MONGODB_URI: rules.optionalString(),
  REDIS_URL: rules.optionalString(),
  RABBITMQ_URL: rules.optionalString(),

  WHATSAPP_POOL_THRESHOLD: rules.optionalNumber(10),
  WHATSAPP_DEVICE_TARGET_DEPTH: rules.optionalNumber(3),
  WHATSAPP_BUY_BATCH_SIZE: rules.optionalNumber(5),
  WHATSAPP_PROBE_CRON: rules.optionalString('*/15 * * * *'),
  WHATSAPP_AUTOBUY_ENABLED: rules.optionalString('false'),

  DARK_SHOPPING_API_KEY: rules.optionalString(),
  DARK_SHOPPING_BASE_URL: rules.optionalString(),
  // Procurement price guards. Absent config keeps the buy path fail-safe: with no
  // expectedUnitUsdCents the adapter throws PROCUREMENT_PRICE_DRIFT (see below).
  WHATSAPP_EXPECTED_UNIT_USD_CENTS: rules.optionalNumber(),
  WHATSAPP_MAX_TOTAL_USD_CENTS: rules.optionalNumber(),
  WHATSAPP_PRICE_DRIFT_TOLERANCE: rules.optionalNumber(0.1),

  WHATSAPP_TEAM_APP_ID: rules.optionalString(),

  DUOPLUS_API_KEY: rules.optionalString(),
  DUOPLUS_API_BASE_URL: rules.optionalString('https://openapi.duoplus.net'),
  DUOPLUS_MIN_DELAY_MS: rules.optionalNumber(1100),
  // Optional egress proxy for provisioned cloud phones. Absent config -> null
  // (proxy step safely skipped), but now operator-configurable via env.
  DUOPLUS_PROXY_ID: rules.optionalString(),
  DUOPLUS_PROXY_HOST: rules.optionalString(),
  DUOPLUS_PROXY_PORT: rules.optionalString(),
  DUOPLUS_PROXY_USER: rules.optionalString(),
  DUOPLUS_PROXY_PASSWORD: rules.optionalString(),

  WHATSAPP_MCP_HTTP_PORT: rules.optionalNumber(7300),
  WHATSAPP_MCP_AUTH_TOKEN: rules.optionalString(),

  WHATSAPP_HEALTH_PORT: rules.optionalNumber(7301),

  LOG_LEVEL: rules.optionalString('info')
});

export function loadWhatsappEnv(env = process.env) {
  const cfg = loadConfig(env, schema);

  const poolThreshold = cfg.WHATSAPP_POOL_THRESHOLD;
  const deviceTargetDepth = cfg.WHATSAPP_DEVICE_TARGET_DEPTH;
  const buyBatchSize = cfg.WHATSAPP_BUY_BATCH_SIZE;
  const darkShoppingApiKey = cfg.DARK_SHOPPING_API_KEY;
  const darkShoppingBaseUrl = cfg.DARK_SHOPPING_BASE_URL;
  const whatsappTeamAppId = cfg.WHATSAPP_TEAM_APP_ID;

  // Resolve the optional egress proxy. Explicit id wins; else a host-based proxy;
  // else null so the device adapter safely skips proxy provisioning.
  let deviceProxy = null;
  if (cfg.DUOPLUS_PROXY_ID) {
    deviceProxy = { id: cfg.DUOPLUS_PROXY_ID };
  } else if (cfg.DUOPLUS_PROXY_HOST) {
    deviceProxy = {
      host: cfg.DUOPLUS_PROXY_HOST,
      port: Number(cfg.DUOPLUS_PROXY_PORT),
      user: cfg.DUOPLUS_PROXY_USER,
      password: cfg.DUOPLUS_PROXY_PASSWORD
    };
  }

  return {
    mongodbUri: cfg.MONGODB_URI,
    redisUrl: cfg.REDIS_URL,
    rabbitmqUrl: cfg.RABBITMQ_URL,

    poolThreshold,
    deviceTargetDepth,
    buyBatchSize,
    probeCron: cfg.WHATSAPP_PROBE_CRON,
    autobuyEnabled: cfg.WHATSAPP_AUTOBUY_ENABLED === 'true',

    darkShoppingApiKey,
    darkShoppingBaseUrl,

    whatsappTeamAppId,

    mcpHttpPort: cfg.WHATSAPP_MCP_HTTP_PORT,
    mcpAuthToken: cfg.WHATSAPP_MCP_AUTH_TOKEN,

    healthPort: cfg.WHATSAPP_HEALTH_PORT,

    logLevel: cfg.LOG_LEVEL,

    // Grouped config the composition root consumes.
    pool: { threshold: poolThreshold, buyBatchSize },
    procurement: {
      apiKey: darkShoppingApiKey,
      baseUrl: darkShoppingBaseUrl,
      expectedUnitUsdCents: cfg.WHATSAPP_EXPECTED_UNIT_USD_CENTS,
      maxTotalUsdCents: cfg.WHATSAPP_MAX_TOTAL_USD_CENTS,
      priceDriftTolerance: cfg.WHATSAPP_PRICE_DRIFT_TOLERANCE
    },
    device: { whatsappTeamAppId, proxy: deviceProxy },
    duoplus: {
      apiKey: cfg.DUOPLUS_API_KEY,
      baseUrl: cfg.DUOPLUS_API_BASE_URL,
      minDelayMs: cfg.DUOPLUS_MIN_DELAY_MS
    }
  };
}

export const env = loadWhatsappEnv();
