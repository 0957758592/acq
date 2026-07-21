import { domainError } from '../errors.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input) {
  if (typeof input !== 'string') {
    throw domainError('EMAIL_INVALID', 'email must be a string');
  }
  const value = input.trim().toLowerCase();
  if (!EMAIL.test(value)) {
    throw domainError('EMAIL_INVALID', `email is not valid: ${input}`);
  }
  return value;
}
