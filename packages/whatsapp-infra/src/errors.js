import { domainError } from '@acq/whatsapp';
export const conflictError = (message) => domainError('CONFLICT', message);
export const notFoundError = (message) => domainError('NOT_FOUND', message);
