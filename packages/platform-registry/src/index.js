export {
  registerPlatform,
  getPlatformCapabilities,
  listPlatforms,
  isSupportedAction,
  resolveAppPackage
} from './registry.js';
export { whatsappCapabilities } from './descriptors/whatsapp.js';
export { telegramCapabilities } from './descriptors/telegram.js';
export { PlatformRegistryError, platformRegistryError } from './errors.js';
