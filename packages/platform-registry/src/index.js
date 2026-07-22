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
export { gmailCapabilities } from './descriptors/gmail.js';
export { tiktokCapabilities } from './descriptors/tiktok.js';
export { instagramCapabilities } from './descriptors/instagram.js';
export { youtubeCapabilities } from './descriptors/youtube.js';
export { PlatformRegistryError, platformRegistryError } from './errors.js';
