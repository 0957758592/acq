import { instagramAdapter } from './instagram/adapter.js';
import { tiktokAdapter } from './tiktok/adapter.js';
import { whatsappAdapter } from './whatsapp/adapter.js';
import { youtubeAdapter } from './youtube/adapter.js';

const ADAPTERS = {
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  whatsapp: whatsappAdapter
};

export function getPlatformAdapter(platform) {
  const key = String(platform || '').trim().toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) throw new Error(`Unsupported platform adapter: ${platform}`);
  return adapter;
}
