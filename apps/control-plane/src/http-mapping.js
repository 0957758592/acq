import crypto from 'node:crypto';

// Maps a domain/facade error code to an HTTP status (TZ §8/§11). Unlisted codes
// default to 400 (client error) — a coded domain rejection, not a server fault.
const STATUS = {
  UNKNOWN_OPERATION: 404,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500
};

export function httpStatusFor(code) {
  if (!code) return 200;
  return STATUS[code] ?? 400;
}

// Constant-time bearer authentication resolving a token to a role/actor
// (fail-closed). Tokens map is { token: role }.
export function authenticate(authHeader, { tokens = {} } = {}) {
  const match = /^Bearer\s+(.+)$/.exec(String(authHeader || ''));
  if (!match) return null;
  const presented = match[1];
  for (const [token, role] of Object.entries(tokens)) {
    const a = Buffer.from(presented);
    const b = Buffer.from(token);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { role, actor: token };
    }
  }
  return null;
}
