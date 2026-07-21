import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

const platformSchema = Yup.string()
  .oneOf(['tiktok', 'instagram', 'youtube'], validationKeys.common.oneOf)
  .required(validationKeys.common.required);

export const engineDeviceSchema = Yup.object({
  provider: Yup.string().oneOf(['vmos', 'duoplus'], validationKeys.common.oneOf).required(validationKeys.common.required),
  providerDeviceId: Yup.string().required(validationKeys.common.required),
  name: Yup.string().required(validationKeys.common.required),
  region: Yup.string(),
  groupName: Yup.string(),
  notes: Yup.string()
});

export const engineAccountSchema = Yup.object({
  platform: platformSchema,
  username: Yup.string().required(validationKeys.common.required),
  password: Yup.string(),
  email: Yup.string().email(validationKeys.common.email),
  emailPassword: Yup.string(),
  displayName: Yup.string(),
  bio: Yup.string(),
  avatarUrl: Yup.string().url(validationKeys.common.url),
  nicheKey: Yup.string(),
  personaKey: Yup.string(),
  assignedDeviceId: Yup.string().nullable()
});

export const enginePostSchema = Yup.object({
  platform: platformSchema,
  postType: Yup.string().oneOf(['', 'reel', 'video', 'short'], validationKeys.common.oneOf),
  accountId: Yup.string().required(validationKeys.common.required),
  deviceId: Yup.string().nullable(),
  sourceUrl: Yup.string().url(validationKeys.common.url).required(validationKeys.common.required),
  caption: Yup.string().max(2200, validationKeys.common.min),
  hashtags: Yup.array().of(Yup.string()),
  scheduledAt: Yup.date().nullable(),
  soundQuery: Yup.string(),
  locationQuery: Yup.string()
});

export const engineProxySchema = Yup.object({
  label: Yup.string(),
  protocol: Yup.string().oneOf(['http', 'https', 'socks5'], validationKeys.common.oneOf),
  host: Yup.string().required(validationKeys.common.required),
  port: Yup.number().required(validationKeys.common.required),
  username: Yup.string(),
  password: Yup.string(),
  countryCode: Yup.string()
});

export const engineNicheSchema = Yup.object({
  key: Yup.string().required(validationKeys.common.required),
  name: Yup.string().required(validationKeys.common.required),
  description: Yup.string(),
  active: Yup.boolean(),
  targetPlatforms: Yup.array().of(platformSchema)
});

export const engineRoutingRuleSchema = Yup.object({
  name: Yup.string().required(validationKeys.common.required),
  active: Yup.boolean(),
  sourcePlatform: Yup.string(),
  targetPlatform: platformSchema,
  nicheKey: Yup.string()
});
