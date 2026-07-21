/**
 * Media ports (TZ §9.8):
 * @typedef {Object} MediaStore
 * @property {(mediaRef: string, deviceId: string) => Promise<string>} stage  // -> path on device
 * @typedef {Object} ContentGenerator
 * @property {(input: { platform: string, niche: string, kind: string }) => Promise<{ caption: string, hashtags: string[], mediaRef: string }>} generate
 */
export { contentKey, dedupeContent, pickFreshContent } from './content-pool.js';
