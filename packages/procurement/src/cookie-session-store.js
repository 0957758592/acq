import crypto from 'node:crypto';

// Encrypted CookieSessionStore (TZ §6.4/§14.4): persistent cookie sessions for
// cookie-based shops, encrypted at rest (AES-256-GCM) with an expiry. isValid
// re-validates on read; an expired session reads as absent (the caller re-logs
// in / raises COOKIE_SESSION_EXPIRED). The backing store is injectable (a Map
// here; a Mongo/vault-backed map in production).
function encrypt(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
}

function decrypt(key, blob) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8');
}

export function createEncryptedCookieSessionStore({ key, clock = { now: () => new Date() }, backing = new Map() } = {}) {
  if (!key || key.length !== 32) throw new Error('cookie session store requires a 32-byte key');

  const notExpired = (entry) => Boolean(entry && new Date(entry.expiresAt).getTime() > clock.now().getTime());

  return {
    async put(shopId, cookies, { expiresAt } = {}) {
      backing.set(shopId, { blob: encrypt(key, cookies), expiresAt });
    },
    async isValid(shopId) {
      return notExpired(backing.get(shopId));
    },
    async get(shopId) {
      const entry = backing.get(shopId);
      if (!notExpired(entry)) return null;
      return decrypt(key, entry.blob);
    }
  };
}
