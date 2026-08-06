import { platformRegistryError } from './errors.js';
import { whatsappCapabilities } from './descriptors/whatsapp.js';
import { telegramCapabilities } from './descriptors/telegram.js';
import { discordCapabilities } from './descriptors/discord.js';
import { facebookCapabilities } from './descriptors/facebook.js';
import { gmailCapabilities } from './descriptors/gmail.js';
import { tiktokCapabilities } from './descriptors/tiktok.js';
import { instagramCapabilities } from './descriptors/instagram.js';
import { youtubeCapabilities } from './descriptors/youtube.js';
import { linkedinCapabilities } from './descriptors/linkedin.js';

// Required fields every PlatformCapabilities descriptor must declare (TZ §3.6).
const REQUIRED_FIELDS = [
  'platform',
  'accountKind',
  'identifierVO',
  'appPackage',
  'appCatalogName',
  'supportedActions',
  'onlineMethod',
  'signupVia',
  'maxAccountsPerDevice',
  'stateVocabulary',
  'scrapeTargets'
];

function normalizeKey(platform) {
  return String(platform || '').trim().toLowerCase();
}

function assertValidDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw platformRegistryError('DESCRIPTOR_INVALID', 'descriptor must be an object');
  }
  for (const field of REQUIRED_FIELDS) {
    if (descriptor[field] === undefined || descriptor[field] === null) {
      throw platformRegistryError('DESCRIPTOR_INVALID', `descriptor.${field} is required`);
    }
  }
  if (!Array.isArray(descriptor.supportedActions)) {
    throw platformRegistryError('DESCRIPTOR_INVALID', 'supportedActions must be an array');
  }
}

const registry = new Map();

export function registerPlatform(descriptor) {
  assertValidDescriptor(descriptor);
  const key = normalizeKey(descriptor.platform);
  if (registry.has(key)) {
    throw platformRegistryError('PLATFORM_ALREADY_REGISTERED', `platform ${key} already registered`);
  }
  registry.set(key, Object.freeze({ ...descriptor, platform: key }));
  return registry.get(key);
}

export function getPlatformCapabilities(platform) {
  const key = normalizeKey(platform);
  const caps = registry.get(key);
  if (!caps) {
    throw platformRegistryError('PLATFORM_UNKNOWN', `no capabilities registered for platform ${key || '(empty)'}`);
  }
  return caps;
}

export function listPlatforms() {
  return [...registry.keys()];
}

export function isSupportedAction(platform, action) {
  return getPlatformCapabilities(platform).supportedActions.includes(action);
}

export function resolveAppPackage(platform) {
  return getPlatformCapabilities(platform).appPackage;
}

// Built-in descriptors registered at module load (single source of truth).
registerPlatform(whatsappCapabilities);
registerPlatform(telegramCapabilities);
registerPlatform(discordCapabilities);
registerPlatform(facebookCapabilities);
registerPlatform(gmailCapabilities);
registerPlatform(tiktokCapabilities);
registerPlatform(instagramCapabilities);
registerPlatform(youtubeCapabilities);
registerPlatform(linkedinCapabilities);
