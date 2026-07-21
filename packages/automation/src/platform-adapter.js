import { instagramAdapter } from './instagram/adapter.js';
import { tiktokAdapter } from './tiktok/adapter.js';
import { whatsappAdapter } from './whatsapp/adapter.js';
import { youtubeAdapter } from './youtube/adapter.js';
import { telegramAdapter } from './telegram/adapter.js';
import { discordAdapter } from './discord/adapter.js';
import { facebookAdapter } from './facebook/adapter.js';

const ADAPTERS = {
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  whatsapp: whatsappAdapter,
  telegram: telegramAdapter,
  discord: discordAdapter,
  facebook: facebookAdapter
};

export function getPlatformAdapter(platform) {
  const key = String(platform || '').trim().toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) throw new Error(`Unsupported platform adapter: ${platform}`);
  return adapter;
}
