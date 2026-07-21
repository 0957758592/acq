// Minimal engine-core env (vendored from apps/api, trimmed to what core needs).
import { defineSchema, loadConfig, rules } from '@acq/config';
import { loadRootEnv } from '@acq/config/env';

loadRootEnv();

const schema = defineSchema({
  MONGODB_URI: rules.optionalString(),
  REDIS_URL: rules.optionalString(),
  RABBITMQ_URL: rules.optionalString(),
  JWT_SECRET: rules.optionalString(),
  AUTH_COOKIE_NAME: rules.optionalString('base.auth')
});

const cfg = loadConfig(process.env, schema);

export const env = {
  mongodbUri: cfg.MONGODB_URI,
  redisUrl: cfg.REDIS_URL,
  rabbitmqUrl: cfg.RABBITMQ_URL,
  jwtSecret: cfg.JWT_SECRET,
  authCookieName: cfg.AUTH_COOKIE_NAME
};
