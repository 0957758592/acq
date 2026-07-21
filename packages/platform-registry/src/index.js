export {
  registerPlatform,
  getPlatformCapabilities,
  listPlatforms,
  isSupportedAction,
  resolveAppPackage
} from './registry.js';
export { whatsappCapabilities } from './descriptors/whatsapp.js';
export { PlatformRegistryError, platformRegistryError } from './errors.js';
