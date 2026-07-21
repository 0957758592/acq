export {
  registerPlatform,
  getPlatformCapabilities,
  listPlatforms,
  isSupportedAction,
  resolveAppPackage
} from './registry.js';
export { whatsappCapabilities } from './descriptors/whatsapp.js';
export { telegramCapabilities } from './descriptors/telegram.js';
export { discordCapabilities } from './descriptors/discord.js';
export { facebookCapabilities } from './descriptors/facebook.js';
export { PlatformRegistryError, platformRegistryError } from './errors.js';
