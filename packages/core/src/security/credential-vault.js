import crypto from 'node:crypto';

// Local credential vault (TZ §14.4) — AES-256-GCM encryption at rest for delivered
// account credentials, implementing the secretResolver contract (put/resolve) with
// a self-contained string ref: `vault:<iv>.<tag>.<data>` (all base64). The ciphertext
// IS the ref, so it stores directly in an account's secretRefs with no separate
// secret collection; decryption needs the key. resolve() passes non-`vault:` refs
// through unchanged, so it composes with env-style refs. A real KMS/HSM adapter can
// replace this later behind the same interface.
const PREFIX = 'vault:';

function toKey(key) {
  const buf = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
  if (!Buffer.isBuffer(buf) || buf.length !== 32) {
    throw new Error('credential vault requires a 32-byte key (Buffer or 64-char hex)');
  }
  return buf;
}

export function createLocalVault({ key } = {}) {
  const k = toKey(key);
  return {
    async put(plaintext) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
      const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
    },
    async resolve(ref) {
      if (typeof ref !== 'string' || !ref.startsWith(PREFIX)) return ref;
      const [iv, tag, data] = ref.slice(PREFIX.length).split('.');
      const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    }
  };
}
