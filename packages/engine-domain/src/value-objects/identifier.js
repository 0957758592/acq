import { normalizeMsisdn } from './msisdn.js';
import { normalizeHandle } from './handle.js';
import { normalizeEmail } from './email.js';
import { domainError } from '../errors.js';

// Identifier dispatcher (TZ §3.8): a platform declares its identifierVO in the
// registry (msisdn | handle | email); this routes to the matching Value Object
// so the aggregate never suffers primitive obsession.
const NORMALIZERS = {
  msisdn: normalizeMsisdn,
  handle: normalizeHandle,
  email: normalizeEmail
};

export function normalizeIdentifier(identifierVO, input) {
  const normalize = NORMALIZERS[identifierVO];
  if (!normalize) {
    throw domainError('IDENTIFIER_VO_UNKNOWN', `no Value Object for identifierVO '${identifierVO}'`);
  }
  return normalize(input);
}
