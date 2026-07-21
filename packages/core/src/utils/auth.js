import { env } from '@acq/core/config/env';
import { verifyJwt } from '@acq/core/auth/jwt';
import { roleAtLeast } from '@acq/core/auth/roles';

export function getAuthTokenFromRequest(req) {
  const rawHeader = req.headers?.authorization || req.headers?.Authorization || '';
  if (rawHeader && rawHeader.startsWith('Bearer ')) {
    const token = rawHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }
  return req.cookies?.[env.authCookieName] || null;
}

function buildAuthError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.payload = { code, message };
  return err;
}

export function requireRole(req, minRole, message) {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    throw buildAuthError(401, 'Not authenticated', 'UNAUTHORIZED');
  }

  let payload = null;
  try {
    payload = verifyJwt(token, env.jwtSecret);
  } catch {
    throw buildAuthError(401, 'Invalid token', 'UNAUTHORIZED');
  }

  if (minRole && !roleAtLeast(payload?.role, minRole)) {
    throw buildAuthError(403, message, 'FORBIDDEN');
  }

  return payload;
}

export function requireUser(req) {
  return requireRole(req, null, 'Not authenticated');
}

export function requireEditor(req) {
  return requireRole(req, 'contributor', 'Editor access required');
}

export function requireAdmin(req) {
  return requireRole(req, 'admin', 'Admin access required');
}

export function requireDon(req) {
  return requireRole(req, 'su', 'Super user access required');
}
