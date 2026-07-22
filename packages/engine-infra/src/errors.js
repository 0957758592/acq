import { domainError } from '@acq/engine-domain';

// Optimistic-lock conflict, surfaced as the unified CONFLICT domain code
// (TZ §20) so every surface maps it consistently.
export function conflictError(message) {
  return domainError('CONFLICT', message);
}
