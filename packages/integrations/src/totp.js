import crypto from 'node:crypto';

// RFC 6238 TOTP / RFC 4226 HOTP. Pure crypto — no external dependency.
// Ported from instagrowth-saas/backend/relogin-fleet.ts and made testable
// (injectable `now`) so it can validate against the published RFC vectors.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input = '') {
  let bits = '';
  for (const char of String(input).toUpperCase().replace(/=+$/, '')) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue; // skip spaces, hyphens, padding
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter >>> 0, 4); // valid for all real timestamps until ~year 6000
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

// Generate the 6-digit code for `secret` (base32) at `now` (ms). `offset` shifts
// the 30s window: 0 = current, +1 = next window (used for clock-skew retry).
export function generateTOTP(secret, { now = Date.now(), stepSeconds = 30, offset = 0 } = {}) {
  const key = base32Decode(secret);
  if (!key.length) throw new Error('Invalid TOTP secret: base32 decoded to empty');
  const counter = Math.floor(now / 1000 / stepSeconds) + offset;
  return hotp(key, counter);
}

// Current + next window. Submit [0] first; on rejection retry with [1].
export function totpCandidates(secret, opts = {}) {
  return [
    generateTOTP(secret, { ...opts, offset: opts.offset || 0 }),
    generateTOTP(secret, { ...opts, offset: (opts.offset || 0) + 1 })
  ];
}
